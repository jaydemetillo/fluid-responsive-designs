#!/usr/bin/env node
/**
 * run.mjs — proves each validator catches the thing it exists to catch.
 *
 * A validator nobody has watched fail is a validator you cannot trust. Every
 * case below asserts on a specific rule id, not just on a non-zero exit, so a
 * check that starts passing for the wrong reason still fails the suite.
 */

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const S = (f) => join(root, 'scripts', f);
const F = (f) => join(root, 'test', 'fixtures', f);
const P = (f) => join(root, 'profiles', f);

function run(script, args) {
  try {
    return { code: 0, out: execFileSync(process.execPath, [script, ...args], { encoding: 'utf8' }) };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout ?? '') + (e.stderr ?? '') };
  }
}

const results = [];
function check(name, fn) {
  try {
    const problem = fn();
    results.push({ name, ok: !problem, problem });
  } catch (e) {
    results.push({ name, ok: false, problem: e.message });
  }
}

// 1. Regression: the hand-documented title collision must be found independently
check('sweep finds the title-band collision in the real DSRT scale', () => {
  const r = run(S('sweep.mjs'), [F('dsrt-tokens.css'), '--profile', P('ecommerce-dsrt.json')]);
  if (r.code !== 1) return `expected exit 1, got ${r.code}`;
  if (!/\[separation\].*title-small.*title-default.*identical/s.test(r.out))
    return 'did not report the title-small / title-default collision';
  if (!/390px/.test(r.out)) return 'did not identify the min anchor as where it collides';
  return null;
});

// 2. The fluid trap: same colour, opposite verdicts, decided by the min anchor
check('contrast judges the 16→18px token at the mobile anchor, not desktop', () => {
  const r = run(S('contrast.mjs'), [F('dsrt-tokens.css'), '--profile', F('fluid-trap.profile.json')]);
  if (r.code !== 1) return `expected exit 1, got ${r.code}`;
  if (!/FLUID TRAP.*subtitle-small/s.test(r.out)) return 'did not identify the trap';
  if (!/needs 4\.5:1 on mobile and only 3:1 on desktop/.test(r.out))
    return 'did not explain the differing threshold';
  // subtitle-default sits on the identical grey and must PASS at 18px
  if (!/--font-subtitle-default\s+18px\s+3\.23:1\s+3:1 ✓/.test(r.out))
    return 'subtitle-default should pass on the same colour — the 18px floor is the whole distinction';
  return null;
});

// 3. Every doctrine rule fires on the fixture built to violate it
check('audit catches every doctrine violation in the broken fixture', () => {
  const r = run(S('audit.mjs'), [F('broken.css'), '--profile', P('pulse.json')]);
  if (r.code !== 1) return `expected exit 1, got ${r.code}`;
  const expected = [
    'clamped-floor',
    'px-leading',
    'px-tracking',
    'bare-vw',
    'clamped-ch',
    'small-target',
    'scalar-in-query',
    'raw-hex',
    'inert-ellipsis',
    'pinned-percentage',
    'fixed-height-target',
    'unregistered-breakpoint',
  ];
  const missing = expected.filter((rule) => !r.out.includes(`[${rule}]`));
  return missing.length ? `rules never fired: ${missing.join(', ')}` : null;
});

// 4. The ellipsis needs all three properties; each absence is its own finding
check('audit reports all three ways an ellipsis goes inert', () => {
  const r = run(S('audit.mjs'), [F('broken.css'), '--profile', P('pulse.json')]);
  const hits = (r.out.match(/\[inert-ellipsis\]/g) ?? []).length;
  return hits >= 3 ? null : `expected 3 inert-ellipsis findings, got ${hits}`;
});

// 5. Generator maths matches a hand-verified file exactly
check('generator reproduces the hand-built DSRT token file', () => {
  const r = run(join(root, 'test', 'idempotence.mjs'), [
    F('dsrt-tokens.css'), '--profile', P('ecommerce-dsrt.json'),
  ]);
  if (r.code !== 0) return `expected exit 0, got ${r.code}\n${r.out}`;
  if (!/0 mismatched/.test(r.out)) return 'reported mismatches';
  return null;
});

// 6. Round trip: generated tokens must survive their own validator
check('generated default profile sweeps clean', () => {
  const tmp = join(root, 'test', '.tmp-default.css');
  const g = run(S('generate.mjs'), ['--profile', P('default.json'), '--out', tmp]);
  if (g.code !== 0) return `generate failed: ${g.out}`;
  const r = run(S('sweep.mjs'), [tmp, '--profile', P('default.json')]);
  return r.code === 0 ? null : `sweep reported errors:\n${r.out}`;
});

// 7. Real Pulse numbers: the two titles collide at the desktop anchor
check('sweep finds the Pulse title collision at 1440px', () => {
  const tmp = join(root, 'test', '.tmp-pulse.css');
  run(S('generate.mjs'), ['--profile', P('pulse.json'), '--out', tmp]);
  const r = run(S('sweep.mjs'), [tmp, '--profile', P('pulse.json')]);
  if (r.code !== 1) return `expected exit 1, got ${r.code}`;
  if (!/screen-title.*page-title.*identical.*1440px/s.test(r.out))
    return 'did not report screen-title / page-title colliding at the max anchor';
  return null;
});

// 8. Anchors are recoverable from the clamp maths alone
check('detect recovers 390→1440 from the clamps without being told', () => {
  const r = run(S('detect.mjs'), [join(root, 'test', 'fixtures')]);
  return /anchors recovered from the clamps: 390px → 1440px/.test(r.out)
    ? null
    : `did not recover the anchors:\n${r.out}`;
});

// ---- reference counts: a person must be able to start from 0, 1 or 2 -------
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';

function scenario(name, refs) {
  const dir = mkdtempSync(join(tmpdir(), 'fr-'));
  const args = ['--out', join(dir, '.utopia')];
  if (refs) {
    const rp = join(dir, 'refs.json');
    writeFileSync(rp, JSON.stringify(refs));
    args.unshift('--refs', rp);
  }
  const i = run(S('init.mjs'), args);
  if (i.code !== 0) return { problem: `init failed: ${i.out}` };
  const profile = join(dir, '.utopia', 'profile.json');
  if (!existsSync(join(dir, '.utopia', 'responsive.json')))
    return { problem: 'responsive.json was not written' };
  const css = join(dir, 'tokens.css');
  const g = run(S('generate.mjs'), ['--profile', profile, '--out', css]);
  if (g.code !== 0) return { problem: `generate failed: ${g.out}` };
  const s = run(S('sweep.mjs'), [css, '--profile', profile]);
  return { initOut: i.out, sweepOut: s.out, sweepCode: s.code };
}

const DESKTOP = {
  '--font-body-default': 14, '--font-title-default': 32,
  '--font-subtitle-small': 18, '--space-m': 24, '--space-page-margin': 80,
};
const MOBILE = {
  '--font-body-default': 12, '--font-title-default': 24,
  '--font-subtitle-small': 16, '--space-m': 16, '--space-page-margin': 16,
};

check('ZERO references produces valid tokens with no input at all', () => {
  const r = scenario('zero', null);
  if (r.problem) return r.problem;
  if (r.sweepCode !== 0) return `sweep reported errors:\n${r.sweepOut}`;
  return null;
});

check('ONE reference derives the missing end and labels it a proposal', () => {
  const r = scenario('one', { anchors: { min: 390, max: 1440 }, desktop: DESKTOP });
  if (r.problem) return r.problem;
  if (!/DERIVED/.test(r.initOut)) return 'nothing was labelled DERIVED';
  if (!/PROPOSALS, not measurements/.test(r.initOut))
    return 'did not warn that derived values are proposals';
  // A token's own base ratio must beat the generic curve: page margin is a
  // custom pair travelling 16->80, so its mobile end is 16, not ~48.
  if (!/--space-page-margin\s+16 → 80/.test(r.initOut))
    return `page margin derived wrongly — custom pair ratio not applied:\n${r.initOut}`;
  return null;
});

check('TWO references read both ends and invent nothing', () => {
  const r = scenario('two', { anchors: { min: 390, max: 1440 }, desktop: DESKTOP, mobile: MOBILE });
  if (r.problem) return r.problem;
  if (/DERIVED/.test(r.initOut)) return 'derived something despite having both ends';
  if (!/READ\s+--space-page-margin\s+16 → 80/.test(r.initOut))
    return 'did not read the referenced pair verbatim';
  return null;
});

check('an unresolvable collision becomes a question, not a silent fudge', () => {
  const r = scenario('two', { anchors: { min: 390, max: 1440 }, desktop: DESKTOP, mobile: MOBILE });
  if (r.problem) return r.problem;
  if (!/DECISIONS NEEDED/.test(r.initOut)) return 'did not surface the decision';
  if (!/differentiate by WEIGHT/.test(r.initOut)) return 'did not offer real options';
  return null;
});

check('generator refuses to paper over an inverted pair', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fr-inv-'));
  const p = join(dir, 'bad.json');
  writeFileSync(p, JSON.stringify({
    id: 'bad', name: 'Inverted', rootFontSize: 16,
    anchors: { min: 390, max: 1440 },
    type: { scale: { '--font-oops': { pair: [24, 12], use: 'inverted' } } },
  }));
  const g = run(S('generate.mjs'), ['--profile', p, '--out', join(dir, 'x.css')]);
  if (g.code === 0) return 'generated an inverted pair without complaint';
  return /inverted token pair/.test(g.out) ? null : `wrong failure:\n${g.out}`;
});

// ---- report ---------------------------------------------------------------
console.log('\n  fluid-responsive-designs — validator proofs\n');
let failed = 0;
for (const r of results) {
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}`);
  if (!r.ok) {
    console.log(`      ${r.problem}`);
    failed++;
  }
}
console.log(`\n  ${results.length - failed}/${results.length} passed\n`);
process.exit(failed ? 1 : 0);
