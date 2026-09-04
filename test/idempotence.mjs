#!/usr/bin/env node
/**
 * idempotence.mjs — does generate.mjs reproduce a hand-verified token file?
 *
 * Compares every token the generator emits against a reference CSS file,
 * numerically, at both anchors and the midpoint. Comment formatting is
 * allowed to differ; resolved pixel values are not.
 *
 * Usage:
 *   node test/idempotence.mjs <reference.css> --profile <profile.json>
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTokens, evalLength, round } from '../scripts/lib/tokens.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const argv = process.argv.slice(2);
const refPath = argv.find((a) => !a.startsWith('-'));
const profilePath = argv[argv.indexOf('--profile') + 1];

if (!refPath || !argv.includes('--profile')) {
  console.error('usage: node test/idempotence.mjs <reference.css> --profile <profile.json>');
  process.exit(2);
}

const profile = JSON.parse(readFileSync(resolve(profilePath), 'utf8'));
const root = profile.rootFontSize ?? 16;
const { min, max } = profile.anchors;
const mid = Math.round((min + max) / 2);
const widths = [min, mid, max];

const generated = execFileSync(
  process.execPath,
  [join(__dirname, '..', 'scripts', 'generate.mjs'), '--profile', resolve(profilePath)],
  { encoding: 'utf8' }
);

const refTokens = parseTokens(readFileSync(resolve(refPath), 'utf8'));
const genTokens = parseTokens(generated);

const evalAt = (tokens, name, w) => {
  const t = tokens.get(name);
  if (!t) return null;
  const v = evalLength(t.value, { width: w, root, vars: tokens });
  return Number.isNaN(v) ? null : round(v, 4);
};

const interesting = [
  ...Object.keys(profile.type?.scale ?? {}),
  ...Object.keys(profile.space?.scale ?? {}),
  ...Object.keys(profile.space?.semantic ?? {}),
];

let compared = 0;
let mismatched = 0;
let skipped = 0;
const rows = [];

for (const name of interesting) {
  if (!refTokens.has(name)) {
    skipped++;
    rows.push({ name, status: 'absent from reference' });
    continue;
  }
  const diffs = widths
    .map((w) => ({ w, ref: evalAt(refTokens, name, w), gen: evalAt(genTokens, name, w) }))
    .filter((d) => d.ref === null || d.gen === null || Math.abs(d.ref - d.gen) > 0.005);

  compared++;
  if (diffs.length) {
    mismatched++;
    rows.push({
      name,
      status: 'MISMATCH',
      detail: diffs.map((d) => `${d.w}px: ref ${d.ref} vs gen ${d.gen}`).join('; '),
    });
  }
}

console.log(`\n  idempotence — ${profile.name}`);
console.log(`  generator output vs ${refPath}`);
console.log(`  compared at ${widths.join('px, ')}px\n`);

for (const r of rows) {
  const icon = r.status === 'MISMATCH' ? '✗' : '·';
  console.log(`  ${icon} ${r.name.padEnd(26)} ${r.status}${r.detail ? ` — ${r.detail}` : ''}`);
}

console.log(
  `\n  ${compared} token(s) compared, ${mismatched} mismatched, ${skipped} not in reference\n`
);

if (mismatched === 0 && compared > 0) {
  console.log('  ✓ the generator reproduces the reference exactly\n');
}

process.exit(mismatched ? 1 : 0);
