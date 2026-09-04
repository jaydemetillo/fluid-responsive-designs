#!/usr/bin/env node
/**
 * contrast.mjs — WCAG contrast judged at the MINIMUM anchor.
 *
 * This is the fluid trap, mechanised.
 *
 * WCAG's "large text" threshold (18px, or 14px bold) is a fixed number, but
 * fluid font sizes are not. A token that runs 16px → 18px qualifies for the
 * relaxed 3:1 allowance at 1440px and does NOT qualify at 390px. Judge it by
 * its desktop size and you ship text that fails 4.5:1 at every width below
 * the top anchor — which is most of them, on most devices.
 *
 * So: size is always evaluated at anchors.min. Never at anchors.max.
 *
 * Usage:
 *   node scripts/contrast.mjs <tokens.css> [--profile <profile.json>] [--json]
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTokens, evalLength, round } from './lib/tokens.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = { css: null, profile: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--profile') args.profile = argv[++i];
    else if (a === '--json') args.json = true;
    else if (!a.startsWith('-')) args.css ??= a;
  }
  return args;
}

/** WCAG 2.1 relative luminance. */
function luminance(hex) {
  const h = hex.replace('#', '').trim();
  let r, g, b;
  if (h.length === 3) {
    [r, g, b] = [...h].map((c) => parseInt(c + c, 16));
  } else if (h.length === 6) {
    [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  } else {
    return null; // alpha or malformed — needs a backdrop to composite against
  }
  const lin = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function ratio(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  if (a === null || b === null) return null;
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG threshold for a given rendered size + weight. */
function threshold(sizePx, weight) {
  const bold = weight === 'bold' || weight === 700 || weight === '700';
  const isLarge = sizePx >= 18 || (bold && sizePx >= 14);
  return isLarge ? 3.0 : 4.5;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.css) {
    console.error('usage: node scripts/contrast.mjs <tokens.css> [--profile <profile.json>] [--json]');
    process.exit(2);
  }

  const profilePath = args.profile
    ? resolve(args.profile)
    : join(__dirname, '..', 'profiles', 'default.json');
  const profile = JSON.parse(readFileSync(profilePath, 'utf8'));
  const tokens = parseTokens(readFileSync(resolve(args.css), 'utf8'));

  const root = profile.rootFontSize ?? 16;
  const anchors = profile.anchors ?? { min: 390, max: 1440 };
  const palette = profile.color?.tokens ?? {};
  const pairings = profile.color?.pairings ?? [];

  if (!pairings.length) {
    console.log(`\n  contrast — ${profile.name}`);
    console.log('\n  No colour pairings declared, so there is nothing to check.');
    console.log('  Add hex values to profile.color.tokens and declare pairs in');
    console.log('  profile.color.pairings, e.g.\n');
    console.log('    { "text": "--font-body-default", "fg": "text/primary",');
    console.log('      "bg": "surface/default", "weight": "regular" }\n');
    if (profile.color?.note) console.log(`  Note: ${profile.color.note}\n`);
    process.exit(0);
  }

  const findings = [];
  const rows = [];

  for (const p of pairings) {
    const fgHex = palette[p.fg] ?? p.fg;
    const bgHex = palette[p.bg] ?? p.bg;
    const r = ratio(fgHex, bgHex);

    if (r === null) {
      findings.push({ severity: 'warn', message: `Could not read colours for ${p.fg} on ${p.bg} (alpha channels need a backdrop to composite against).`, pairing: p });
      continue;
    }

    const isUi = p.type === 'ui';
    let sizeMin = null;
    let sizeMax = null;
    let need;

    if (isUi) {
      need = 3.0;
    } else {
      const t = tokens.get(p.text);
      if (!t) {
        findings.push({ severity: 'warn', message: `Pairing references ${p.text}, which is not in the CSS.`, pairing: p });
        continue;
      }
      sizeMin = evalLength(t.value, { width: anchors.min, root, vars: tokens });
      sizeMax = evalLength(t.value, { width: anchors.max, root, vars: tokens });
      need = threshold(sizeMin, p.weight);
    }

    const pass = r >= need - 0.005;
    const needAtMax = isUi ? 3.0 : threshold(sizeMax, p.weight);
    const isTrap = !isUi && needAtMax !== need;

    rows.push({
      label: isUi ? `${p.name ?? 'UI component'}` : p.text,
      sizeMin,
      sizeMax,
      fg: p.fg,
      bg: p.bg,
      ratio: round(r, 2),
      need,
      pass,
      isTrap,
    });

    if (!pass) {
      const where = isUi
        ? 'UI component / focus indicator'
        : `${round(sizeMin, 1)}px at the ${anchors.min}px anchor`;
      findings.push({
        severity: 'error',
        message: `${p.fg} on ${p.bg} is ${round(r, 2)}:1 — needs ${need}:1 (${where}).`,
        pairing: p,
        ratio: round(r, 2),
        need,
      });
    }

    if (isTrap) {
      const verdict = pass ? 'passes' : 'fails';
      findings.push({
        severity: pass ? 'info' : 'error',
        message: `FLUID TRAP — ${p.text} is ${round(sizeMin, 1)}px at ${anchors.min}px but ${round(sizeMax, 1)}px at ${anchors.max}px, so it needs ${need}:1 on mobile and only ${needAtMax}:1 on desktop. Judged at desktop it would look fine; judged correctly it ${verdict}.`,
        pairing: p,
      });
    }

    const advisory = profile.type?.advisoryMinSize;
    if (!isUi && advisory && sizeMin < advisory) {
      findings.push({
        severity: 'warn',
        message: `${p.text} renders ${round(sizeMin, 1)}px at ${anchors.min}px — under the ${advisory}px readability advisory. Contrast alone will not make it legible.`,
        pairing: p,
      });
    }
  }

  const errors = findings.filter((f) => f.severity === 'error');
  const warns = findings.filter((f) => f.severity === 'warn');

  if (args.json) {
    console.log(JSON.stringify({ profile: profile.id, rows, findings, ok: errors.length === 0 }, null, 2));
    process.exit(errors.length ? 1 : 0);
  }

  console.log(`\n  contrast — ${profile.name}`);
  console.log(`  every size judged at the ${anchors.min}px anchor, never at ${anchors.max}px\n`);
  console.log(`  ${'element'.padEnd(26)}${'@min'.padStart(8)}${'ratio'.padStart(9)}${'needs'.padStart(8)}   `);
  console.log(`  ${'-'.repeat(51)}`);
  for (const r of rows) {
    const size = r.sizeMin === null ? '—' : `${round(r.sizeMin, 1)}px`;
    const mark = r.pass ? '✓' : '✗';
    const trap = r.isTrap ? '  ⟵ fluid trap' : '';
    console.log(`  ${r.label.padEnd(26)}${size.padStart(8)}${(r.ratio + ':1').padStart(9)}${(r.need + ':1').padStart(8)} ${mark}${trap}`);
  }
  console.log('');

  const icon = { error: '✗', warn: '⚠', info: 'ℹ' };
  for (const f of findings) console.log(`  ${icon[f.severity]} ${f.message}`);

  console.log(`\n  ${errors.length} error(s), ${warns.length} warning(s)\n`);
  process.exit(errors.length ? 1 : 0);
}

main();
