#!/usr/bin/env node
/**
 * detect.mjs — read before you ask.
 *
 * A skill that asks twelve questions with no defaults is a form, and forms
 * get abandoned. Everything this script finds becomes a *proposed default*
 * for the elicitation step, so the common path is confirmation rather than
 * data entry.
 *
 * The nice trick here is anchor recovery: a clamp() carries enough
 * information to reconstruct the two viewport widths it was generated from,
 * so an existing token file tells you its own anchors without being asked.
 *
 * Usage:
 *   node scripts/detect.mjs <project-dir> [--json]
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, join, extname, relative, basename } from 'node:path';

const EXTS = new Set(['.css', '.scss', '.sass', '.less']);
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', 'vendor']);
const round = (n, dp = 0) => Math.round(n * 10 ** dp) / 10 ** dp;

function walk(p, out = [], depth = 0) {
  if (depth > 8) return out;
  let st;
  try {
    st = statSync(p);
  } catch {
    return out;
  }
  if (st.isDirectory()) {
    for (const e of readdirSync(p)) {
      if (SKIP.has(e)) continue;
      walk(join(p, e), out, depth + 1);
    }
  } else if (EXTS.has(extname(p))) out.push(p);
  return out;
}

/**
 * Recover the anchor pair a clamp() was generated from.
 *   value = clamp(minRem, baseRem + slopeVw, maxRem)
 *   minWidth = (minPx - basePx) / slope
 *   maxWidth = (maxPx - basePx) / slope
 */
function recoverAnchors(decl, root = 16) {
  const m = decl.match(
    /clamp\(\s*(-?[\d.]+)rem\s*,\s*(-?[\d.]+)rem\s*\+\s*(-?[\d.]+)v[wi]\s*,\s*(-?[\d.]+)rem\s*\)/i
  );
  if (!m) return null;
  const [minRem, baseRem, slopeVw, maxRem] = m.slice(1).map(parseFloat);
  const slope = slopeVw / 100;
  if (!slope) return null;
  const basePx = baseRem * root;
  return {
    min: (minRem * root - basePx) / slope,
    max: (maxRem * root - basePx) / slope,
    pair: [round(minRem * root, 1), round(maxRem * root, 1)],
  };
}

const modal = (arr) => {
  const counts = new Map();
  for (const v of arr) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
};

function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const dir = resolve(argv.find((a) => !a.startsWith('-')) ?? '.');

  const files = walk(dir);
  const report = {
    root: dir,
    styleFiles: files.length,
    tokenFiles: [],
    anchors: null,
    fluidTokens: 0,
    staticFloors: {},
    breakpoints: [],
    signals: {},
    configs: [],
  };

  for (const f of ['tailwind.config.js', 'tailwind.config.ts', 'postcss.config.js', '.utopia/responsive.json'])
    if (existsSync(join(dir, f))) report.configs.push(f);

  const minA = [];
  const maxA = [];
  const bps = new Set();

  for (const f of files) {
    const css = readFileSync(f, 'utf8');
    const rel = relative(dir, f) || basename(f);

    const clamps = css.match(/--[\w-]+\s*:\s*clamp\([^;]+\)/g) ?? [];
    if (clamps.length >= 3) report.tokenFiles.push({ file: rel, tokens: clamps.length });
    report.fluidTokens += clamps.length;

    for (const c of clamps) {
      const a = recoverAnchors(c);
      if (a && a.min > 100 && a.max > a.min && a.max < 4000) {
        minA.push(round(a.min));
        maxA.push(round(a.max));
      }
    }

    for (const m of css.matchAll(/@media[^{]*?\(\s*(?:min|max)-width\s*:\s*([\d.]+)px/g))
      bps.add(parseFloat(m[1]));

    for (const [name, re] of [
      ['tapTargetMin', /--tap-target[\w-]*\s*:\s*(\d+)px/],
      ['focusRingWidth', /--focus-ring-width\s*:\s*(\d+)px/],
      ['clickTargetMin', /--click-target[\w-]*\s*:\s*(\d+)px/],
    ]) {
      const hit = css.match(re);
      if (hit) report.staticFloors[name] = parseFloat(hit[1]);
    }

    const sig = (k, re) => {
      if (re.test(css)) report.signals[k] = (report.signals[k] ?? 0) + 1;
    };
    sig('tables', /\btable\b|\bthead\b|\btbody\b|role=["']table/);
    sig('pinnedColumns', /position\s*:\s*sticky/);
    sig('truncation', /text-overflow\s*:\s*ellipsis|line-clamp/);
    sig('navigation', /\bnav\b|hamburger|drawer|tab-?bar|sidebar/i);
    sig('autoFitGrids', /repeat\(\s*auto-(fit|fill)/);
    sig('containerQueries', /@container/);
    sig('cardGrids', /\bcard\b/i);
  }

  const [mn, mnCount] = modal(minA);
  const [mx] = modal(maxA);
  if (mn && mx) report.anchors = { min: mn, max: mx, confidence: `${mnCount}/${minA.length} tokens agree` };
  report.breakpoints = [...bps].sort((a, b) => a - b);

  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`\n  detect — ${dir}\n`);
  console.log(`  ${report.styleFiles} stylesheet(s), ${report.fluidTokens} fluid token(s)`);
  if (report.configs.length) console.log(`  config: ${report.configs.join(', ')}`);

  if (report.tokenFiles.length) {
    console.log('\n  token files');
    for (const t of report.tokenFiles) console.log(`    ${t.file} (${t.tokens} clamps)`);
  }

  if (report.anchors) {
    console.log(`\n  anchors recovered from the clamps: ${report.anchors.min}px → ${report.anchors.max}px`);
    console.log(`    ${report.anchors.confidence}`);
  } else if (report.fluidTokens === 0) {
    console.log('\n  no fluid tokens found — this is a greenfield or fully static codebase');
  }

  if (Object.keys(report.staticFloors).length) {
    console.log('\n  static floors already declared');
    for (const [k, v] of Object.entries(report.staticFloors)) console.log(`    ${k}: ${v}px`);
  }

  if (report.breakpoints.length) {
    console.log(`\n  breakpoints in use: ${report.breakpoints.join(', ')}px`);
    console.log('    each of these needs a question it answers, or it should be a clamp()');
  }

  const sigs = Object.entries(report.signals);
  if (sigs.length) {
    console.log('\n  signals');
    for (const [k, v] of sigs) console.log(`    ${k.padEnd(18)} ${v} file(s)`);
  }

  console.log('\n  Use these as proposed defaults in the elicitation. Do not ask');
  console.log('  the user anything this report already answered.\n');
}

main();
