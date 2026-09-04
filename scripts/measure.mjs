#!/usr/bin/env node
/**
 * measure.mjs — drift and layout integrity on a LIVE page.
 *
 * sweep.mjs proves the arithmetic. This proves the pixels, and they are not
 * the same claim.
 *
 * The motivating bug: a checkbox column with a fixed 44px token measured
 * 52.8px at 768px. Nothing in the CSS was wrong. CSS table layout shares
 * leftover space across every column when no column volunteers to absorb it,
 * so the layout engine quietly overruled the token. That failure is a few
 * pixels wide, invisible in review, and undetectable from the stylesheet —
 * you have to measure the rendered page.
 *
 * Requires Playwright:  npm i -D playwright && npx playwright install chromium
 *
 * Usage:
 *   node scripts/measure.mjs <url> --profile <profile.json> [--json]
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error(`
  measure.mjs needs Playwright to drive a real browser.

    npm i -D playwright && npx playwright install chromium

  Everything else in this repo runs with zero install — this is the one
  script that cannot, because drift only exists once a browser has laid
  the page out.
`);
  process.exit(2);
}

function parseArgs(argv) {
  const args = { url: null, profile: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--profile') args.profile = argv[++i];
    else if (a === '--json') args.json = true;
    else if (!a.startsWith('-')) args.url ??= a;
  }
  return args;
}

const findings = [];
const flag = (severity, check, width, message, why) =>
  findings.push({ severity, check, width, message, why });

const round = (n, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.url) {
    console.error('usage: node scripts/measure.mjs <url> --profile <profile.json> [--json]');
    process.exit(2);
  }

  const profile = JSON.parse(
    readFileSync(args.profile ? resolve(args.profile) : join(__dirname, '..', 'profiles', 'default.json'), 'utf8')
  );
  const m = profile.measure ?? {};
  const anchors = profile.anchors ?? { min: 390, max: 1440 };
  const widths = m.widths ?? [anchors.min, 480, 600, 699, 700, 768, 899, 900, 1024, 1200, anchors.max];
  const tol = m.tolerancePx ?? 0.5;

  const browser = await chromium.launch();
  const page = await browser.newPage();

  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(args.url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(120); // let clamp()/layout settle

    // ---- the page itself must never scroll sideways ---------------------
    if (m.noPageHScroll !== false) {
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      if (overflow > 1)
        flag('error', 'page-hscroll', width,
          `The page scrolls sideways by ${round(overflow)}px.`,
          'Only a designated scroll container (a table, a carousel) may scroll horizontally. The page itself never should.');
    }

    // ---- ZERO DRIFT: fixed widths must measure their exact token value --
    for (const spec of m.fixedWidths ?? []) {
      const measured = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        return el ? el.getBoundingClientRect().width : null;
      }, spec.selector);
      if (measured === null) continue;
      if (Math.abs(measured - spec.expected) > tol)
        flag('error', 'drift', width,
          `${spec.selector} measures ${round(measured)}px but its token says ${spec.expected}px.`,
          spec.why ?? 'A fixed column drifting means some leftover space is being shared across every column. Guarantee exactly one stretchy column at every width to absorb it.');
    }

    // ---- fluid widths must hit their pair exactly at the anchors --------
    for (const spec of m.fluidWidths ?? []) {
      if (width !== anchors.min && width !== anchors.max) continue;
      const expected = width === anchors.min ? spec.pair[0] : spec.pair[1];
      const measured = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        return el ? el.getBoundingClientRect().width : null;
      }, spec.selector);
      if (measured === null) continue;
      if (Math.abs(measured - expected) > tol)
        flag('error', 'anchor-miss', width,
          `${spec.selector} measures ${round(measured)}px at the anchor; the design says ${expected}px.`,
          'The two anchors are the widths anyone actually reviews. If the build misses them, design and code have already drifted apart.');
    }

    // ---- nothing wraps to a second line --------------------------------
    for (const sel of m.noWrap ?? []) {
      const bad = await page.evaluate((s) => {
        const out = [];
        for (const el of document.querySelectorAll(s)) {
          const lh = parseFloat(getComputedStyle(el).lineHeight) || 0;
          if (lh && el.getBoundingClientRect().height > lh * 1.6)
            out.push({ text: el.textContent.trim().slice(0, 40), h: el.getBoundingClientRect().height, lh });
        }
        return out;
      }, sel);
      for (const b of bad)
        flag('error', 'wrap', width,
          `${sel} wrapped to a second line ("${b.text}", ${round(b.h)}px tall vs ${round(b.lh)}px line).`,
          'A uniform row height is worth more than a full label in a scanning table. Truncate instead.');
    }

    // ---- overflowing text must actually truncate ------------------------
    for (const sel of m.truncates ?? []) {
      const bad = await page.evaluate((s) => {
        const out = [];
        for (const el of document.querySelectorAll(s)) {
          if (el.scrollWidth <= el.clientWidth + 1) continue;
          const cs = getComputedStyle(el);
          const display = cs.display;
          const inert = cs.textOverflow !== 'ellipsis' || cs.overflow === 'visible' ||
            display === 'inline' || display === 'table-cell';
          if (inert)
            out.push({ text: el.textContent.trim().slice(0, 40), display, to: cs.textOverflow, ov: cs.overflow });
        }
        return out;
      }, sel);
      for (const b of bad)
        flag('error', 'no-ellipsis', width,
          `${sel} overflows without truncating ("${b.text}" — display:${b.display}, text-overflow:${b.to}, overflow:${b.ov}).`,
          'text-overflow silently does nothing on inline text and on a table cell itself. Put it on a block-level wrapper inside the cell.');
    }

    // ---- neighbours must not overlap ------------------------------------
    for (const sel of m.noOverlap ?? []) {
      const overlaps = await page.evaluate((s) => {
        const els = [...document.querySelectorAll(s)].map((e) => ({
          r: e.getBoundingClientRect(),
          t: e.textContent.trim().slice(0, 24),
        }));
        const out = [];
        for (let i = 0; i < els.length - 1; i++) {
          const a = els[i].r;
          const b = els[i + 1].r;
          if (Math.abs(a.top - b.top) > 2) continue; // different rows
          if (a.right > b.left + 1) out.push({ a: els[i].t, b: els[i + 1].t, by: a.right - b.left });
        }
        return out;
      }, sel);
      for (const o of overlaps)
        flag('error', 'overlap', width,
          `"${o.a}" overlaps "${o.b}" by ${round(o.by)}px.`,
          'Overlap means a column is being sized past its share. Usually the same root cause as drift.');
    }

    // ---- text scale must not invert on the rendered page -----------------
    if (m.monotonicText?.length > 1) {
      const sizes = await page.evaluate((sels) =>
        sels.map((s) => {
          const el = document.querySelector(s);
          return el ? parseFloat(getComputedStyle(el).fontSize) : null;
        }), m.monotonicText);
      for (let i = 0; i < sizes.length - 1; i++) {
        if (sizes[i] === null || sizes[i + 1] === null) continue;
        if (sizes[i] > sizes[i + 1] + 0.01)
          flag('error', 'inverted-scale', width,
            `${m.monotonicText[i]} (${sizes[i]}px) is larger than ${m.monotonicText[i + 1]} (${sizes[i + 1]}px).`,
            'A heading that renders smaller than body text is a scale inversion. sweep.mjs catches this in the tokens; this catches it after cascade and specificity have had their say.');
      }
    }
  }

  await browser.close();
  report(args, profile, widths);
}

function report(args, profile, widths) {
  const errors = findings.filter((f) => f.severity === 'error');
  const warns = findings.filter((f) => f.severity === 'warn');

  if (args.json) {
    console.log(JSON.stringify({ profile: profile.id, widths, findings, ok: !errors.length }, null, 2));
    process.exit(errors.length ? 1 : 0);
  }

  console.log(`\n  measure — ${profile.name}`);
  console.log(`  ${args.url}`);
  console.log(`  measured at ${widths.join(', ')}px\n`);

  const byWidth = new Map();
  for (const f of findings) {
    if (!byWidth.has(f.width)) byWidth.set(f.width, []);
    byWidth.get(f.width).push(f);
  }
  const icon = { error: '✗', warn: '⚠' };
  for (const w of widths) {
    const fs = byWidth.get(w);
    if (!fs?.length) continue;
    console.log(`  ${w}px`);
    for (const f of fs) {
      console.log(`    ${icon[f.severity]} [${f.check}] ${f.message}`);
      console.log(`          ${f.why}`);
    }
  }

  if (!findings.length) console.log('  ✓ zero drift, no overlap, no wrap, nothing untruncated');
  console.log(`\n  ${errors.length} error(s), ${warns.length} warning(s)\n`);
  process.exit(errors.length ? 1 : 0);
}

main();
