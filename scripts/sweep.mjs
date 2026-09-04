#!/usr/bin/env node
/**
 * sweep.mjs — scale integrity across the whole viewport range.
 *
 * Utopia guarantees your tokens are correct at the two anchors. It says
 * nothing about the 1100 widths in between, which is where fluid scales
 * actually break: two steps cross over, a token drifts out of its band, or
 * two roles collapse to the same value and stop being distinguishable.
 *
 * Usage:
 *   node scripts/sweep.mjs <tokens.css> [--profile <profile.json>] [--json]
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTokens, evalLength, round } from './lib/tokens.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EPS = 0.01;

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

const findings = [];
const add = (severity, check, message, detail = {}) =>
  findings.push({ severity, check, message, ...detail });

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.css) {
    console.error('usage: node scripts/sweep.mjs <tokens.css> [--profile <profile.json>] [--json]');
    process.exit(2);
  }

  const profilePath = args.profile
    ? resolve(args.profile)
    : join(__dirname, '..', 'profiles', 'default.json');
  const profile = JSON.parse(readFileSync(profilePath, 'utf8'));
  const css = readFileSync(resolve(args.css), 'utf8');
  const tokens = parseTokens(css);

  const root = profile.rootFontSize ?? 16;
  const { from, to, step } = profile.sweep ?? { from: 320, to: 2560, step: 2 };
  const anchors = profile.anchors ?? { min: 390, max: 1440 };

  const widths = [];
  for (let w = from; w <= to; w += step) widths.push(w);
  for (const a of [anchors.min, anchors.max]) if (!widths.includes(a)) widths.push(a);
  widths.sort((a, b) => a - b);

  const at = (name, w) => {
    const t = tokens.get(name);
    if (!t) return NaN;
    return evalLength(t.value, { width: w, root, vars: tokens });
  };

  // ---- presence -----------------------------------------------------------
  const declared = [...(profile.type?.scaleOrder ?? []), ...(profile.space?.tokens ?? [])];
  const missing = declared.filter((n) => !tokens.has(n));
  for (const n of missing) add('warn', 'presence', `Token ${n} is declared in the profile but not found in the CSS.`, { token: n });

  const present = (n) => tokens.has(n) && !Number.isNaN(at(n, anchors.min));

  // ---- global bounds ------------------------------------------------------
  const gb = profile.type?.globalBounds;
  if (gb) {
    for (const name of profile.type.scaleOrder ?? []) {
      if (!present(name)) continue;
      let worstLow = null;
      let worstHigh = null;
      for (const w of widths) {
        const v = at(name, w);
        if (v < gb.min - EPS && (!worstLow || v < worstLow.v)) worstLow = { w, v };
        if (v > gb.max + EPS && (!worstHigh || v > worstHigh.v)) worstHigh = { w, v };
      }
      if (worstLow)
        add('error', 'global-bounds', `${name} renders ${round(worstLow.v)}px at ${worstLow.w}px — below the ${gb.min}px floor.`, { token: name, width: worstLow.w, value: round(worstLow.v) });
      if (worstHigh)
        add('error', 'global-bounds', `${name} renders ${round(worstHigh.v)}px at ${worstHigh.w}px — above the ${gb.max}px ceiling.`, { token: name, width: worstHigh.w, value: round(worstHigh.v) });
    }
  }

  // ---- band containment ---------------------------------------------------
  for (const [band, spec] of Object.entries(profile.type?.bands ?? {})) {
    for (const name of spec.tokens ?? []) {
      if (!present(name)) continue;
      let breach = null;
      for (const w of widths) {
        const v = at(name, w);
        if (v < spec.min - EPS || v > spec.max + EPS) {
          if (!breach) breach = { w, v };
        }
      }
      if (breach)
        add('error', 'band', `${name} leaves the "${band}" band (${spec.min}–${spec.max}px): ${round(breach.v)}px at ${breach.w}px.`, { token: name, band, width: breach.w, value: round(breach.v) });
    }
  }

  // ---- monotonicity -------------------------------------------------------
  const order = (profile.type?.scaleOrder ?? []).filter(present);
  for (let i = 0; i < order.length - 1; i++) {
    const [a, b] = [order[i], order[i + 1]];
    let cross = null;
    for (const w of widths) {
      if (at(a, w) > at(b, w) + EPS) {
        cross = { w, av: at(a, w), bv: at(b, w) };
        break;
      }
    }
    if (cross)
      add('error', 'monotonic', `${a} overtakes ${b} at ${cross.w}px (${round(cross.av)}px vs ${round(cross.bv)}px) — the scale inverts mid-range.`, { tokens: [a, b], width: cross.w });
  }

  // ---- step separation ----------------------------------------------------
  const minSep = profile.type?.minStepSeparation ?? 2;
  for (let i = 0; i < order.length - 1; i++) {
    const [a, b] = [order[i], order[i + 1]];
    for (const [label, w] of [['min anchor', anchors.min], ['max anchor', anchors.max]]) {
      const sep = at(b, w) - at(a, w);
      if (sep <= EPS) {
        add('error', 'separation', `${a} and ${b} are identical at the ${label} (${w}px): both ${round(at(a, w))}px. Two roles that render the same size are not two roles.`, { tokens: [a, b], width: w, separation: 0 });
      } else if (sep < minSep - EPS) {
        add('warn', 'separation', `${a} → ${b} differ by only ${round(sep)}px at the ${label} (${w}px); profile wants ${minSep}px.`, { tokens: [a, b], width: w, separation: round(sep) });
      }
    }
  }

  // ---- advisory floor -----------------------------------------------------
  const advisory = profile.type?.advisoryMinSize;
  if (advisory) {
    for (const name of order) {
      const v = at(name, anchors.min);
      if (v < advisory - EPS)
        add('warn', 'advisory', `${name} is ${round(v)}px at ${anchors.min}px — under the ${advisory}px readability advisory. ${profile.type.advisoryNote ?? ''}`.trim(), { token: name, value: round(v) });
    }
  }

  // ---- 4pt grid at the anchors -------------------------------------------
  const gridPt = profile.space?.gridPt;
  if (gridPt) {
    for (const name of profile.space.tokens ?? []) {
      if (!present(name)) continue;
      for (const [label, w] of [['min anchor', anchors.min], ['max anchor', anchors.max]]) {
        const v = at(name, w);
        const off = Math.abs(v - Math.round(v / gridPt) * gridPt);
        if (off > EPS)
          add('error', 'grid', `${name} is ${round(v)}px at the ${label} (${w}px) — off the ${gridPt}pt grid.`, { token: name, width: w, value: round(v) });
      }
    }
  }

  report(args, profile, tokens, order, anchors, root);
}

function report(args, profile, tokens, order, anchors, root) {
  const errors = findings.filter((f) => f.severity === 'error');
  const warns = findings.filter((f) => f.severity === 'warn');

  if (args.json) {
    console.log(JSON.stringify({ profile: profile.id, findings, ok: errors.length === 0 }, null, 2));
    process.exit(errors.length ? 1 : 0);
  }

  console.log(`\n  sweep — ${profile.name}`);
  console.log(`  anchors ${anchors.min}px → ${anchors.max}px, swept ${profile.sweep.from}–${profile.sweep.to}px\n`);

  // scale table
  if (order.length) {
    const mid = Math.round((anchors.min + anchors.max) / 2);
    console.log(`  ${'token'.padEnd(26)}${String(anchors.min).padStart(8)}${String(mid).padStart(9)}${String(anchors.max).padStart(9)}`);
    console.log(`  ${'-'.repeat(26)}${'-'.repeat(26)}`);
    for (const name of order) {
      const cells = [anchors.min, mid, anchors.max]
        .map((w) => `${round(evalLength(tokens.get(name).value, { width: w, root, vars: tokens }), 1)}px`)
        .map((s, i) => s.padStart(i === 0 ? 8 : 9));
      console.log(`  ${name.padEnd(26)}${cells.join('')}`);
    }
    console.log('');
  }

  const icon = { error: '✗', warn: '⚠' };
  for (const f of [...errors, ...warns]) {
    console.log(`  ${icon[f.severity]} [${f.check}] ${f.message}`);
  }

  if (!findings.length) console.log('  ✓ all checks passed');
  console.log(`\n  ${errors.length} error(s), ${warns.length} warning(s)\n`);
  process.exit(errors.length ? 1 : 0);
}

main();
