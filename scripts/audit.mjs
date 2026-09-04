#!/usr/bin/env node
/**
 * audit.mjs — doctrine violations in a codebase.
 *
 * Every rule here encodes one of the three buckets:
 *   scalar     — must interpolate, must never be queried
 *   structural — must step, query is correct
 *   static     — must never vary, must never be clamped
 *
 * Usage:
 *   node scripts/audit.mjs <file-or-dir...> [--profile <profile.json>] [--json]
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXTS = new Set(['.css', '.scss', '.sass', '.less']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage']);

function parseArgs(argv) {
  const args = { paths: [], profile: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--profile') args.profile = argv[++i];
    else if (a === '--json') args.json = true;
    else if (!a.startsWith('-')) args.paths.push(a);
  }
  return args;
}

function walk(p, out = []) {
  const st = statSync(p);
  if (st.isDirectory()) {
    for (const e of readdirSync(p)) {
      if (SKIP_DIRS.has(e)) continue;
      walk(join(p, e), out);
    }
  } else if (EXTS.has(extname(p))) {
    out.push(p);
  }
  return out;
}

const findings = [];
const flag = (severity, rule, file, line, message, why) =>
  findings.push({ severity, rule, file, line, message, why });

/**
 * Blank out comments while preserving line and column positions, so reported
 * line numbers still point at the real source. Doing this per-line misses
 * multi-line comments, and the trailing "*\/" then fuses onto the next
 * selector — which quietly defeats any selector matching downstream.
 */
const stripComments = (css) =>
  css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

/**
 * Split a stylesheet into rule blocks with their declarations, tracking the
 * enclosing @media condition. Deliberately simple — enough context to tell a
 * line-height on fluid text from one on a fixed-size heading.
 */
function blocks(css) {
  const lines = stripComments(css).split('\n');
  const out = [];
  const stack = [];
  let selector = '';
  lines.forEach((raw, i) => {
    const lineNo = i + 1;
    const line = raw;
    for (const ch of line) {
      if (ch === '{') {
        stack.push({ selector: selector.trim(), decls: [], startLine: lineNo });
        selector = '';
      } else if (ch === '}') {
        const b = stack.pop();
        if (b) {
          b.media = stack.find((s) => s.selector.startsWith('@media'))?.selector ?? null;
          out.push(b);
        }
        // Reset here too, or declaration text from the block we just closed
        // bleeds into the next selector — which silently breaks the @media
        // detection above, since the condition no longer starts with "@media".
        selector = '';
      } else {
        selector += ch;
      }
    }
    const cur = stack[stack.length - 1];
    const decl = line.match(/([-\w]+)\s*:\s*([^;{]+);/g);
    if (cur && decl) {
      for (const d of decl) {
        const m = d.match(/([-\w]+)\s*:\s*([^;{]+);/);
        if (m) cur.decls.push({ prop: m[1].trim(), value: m[2].trim(), line: lineNo });
      }
    }
  });
  while (stack.length) {
    const b = stack.pop();
    b.media = null;
    out.push(b);
  }
  return out;
}

const isClamped = (v) => /clamp\s*\(/i.test(v);
const usesFluidFont = (decls) =>
  decls.some(
    (d) => d.prop === 'font-size' && (/var\(\s*--font-/.test(d.value) || isClamped(d.value))
  );

function auditFile(file, profile, rel) {
  const css = readFileSync(file, 'utf8');
  const bs = blocks(css);
  const staticNames = profile.static?.neverClamp ?? [];
  const allowedInQuery = new Set(profile.structural?.allowedMediaQueryProps ?? []);
  const tapMin = profile.static?.tapTargetMin ?? 44;

  for (const b of bs) {
    const fluidText = usesFluidFont(b.decls);

    for (const d of b.decls) {
      const { prop, value, line } = d;

      // --- static floors must never be clamped -------------------------
      if (staticNames.some((n) => prop.startsWith(n)) && isClamped(value)) {
        flag('error', 'clamped-floor', rel, line,
          `${prop} is inside a clamp().`,
          'Accessibility floors are static. A target that reads 44px at the top anchor is under 44px at every width below it — a silent failure at exactly the widths where touch matters.');
      }

      // --- px line-height / letter-spacing on fluid text ----------------
      if (fluidText && prop === 'line-height' && /\d\s*px/.test(value)) {
        flag('error', 'px-leading', rel, line,
          `line-height is set in px (${value}) on a rule with fluid font-size.`,
          'Unitless line-height scales with the font for free. A px value desynchronises and clips descenders at one end of the range.');
      }
      if (fluidText && prop === 'letter-spacing' && /\d\s*px/.test(value)) {
        flag('error', 'px-tracking', rel, line,
          `letter-spacing is set in px (${value}) on a rule with fluid font-size.`,
          'Use em so optical tightening tracks the fluid size.');
      }

      // --- bare vw font-size (WCAG 1.4.4) -------------------------------
      if (prop === 'font-size' && /\d\s*vw/.test(value) && !isClamped(value)) {
        flag('error', 'bare-vw', rel, line,
          `font-size uses bare vw (${value}).`,
          'Bare vw ignores the browser font-size setting and breaks 200% zoom (WCAG 1.4.4). Use clamp() with a rem-based preferred value.');
      }

      // --- clamp() around a ch measure ----------------------------------
      if (/max-width|width|measure/.test(prop) && isClamped(value) && /\dch/.test(value)) {
        flag('error', 'clamped-ch', rel, line,
          `${prop} wraps a ch value in clamp().`,
          'ch is already relative to the fluid font size, so it is fluid for free. Nesting the two makes the result unpredictable.');
      }

      // --- tap targets below the floor ----------------------------------
      if ((prop === 'min-height' || prop === 'min-width') && /^(\d+(?:\.\d+)?)px$/.test(value)) {
        const px = parseFloat(value);
        const interactive = /button|a\b|\[role|input|select|textarea|tab|nav|link|chip|toggle|checkbox|radio/i.test(b.selector);
        if (interactive && px > 0 && px < tapMin) {
          flag('warn', 'small-target', rel, line,
            `${b.selector.trim() || 'rule'} sets ${prop}: ${value}, under the ${tapMin}px tap floor.`,
            'WCAG 2.5.5 / Apple HIG want 44px on touch. Use min-height: var(--tap-target-min) and let padding grow it from there.');
        }
      }

      // --- media queries outside the structural allowlist ---------------
      if (b.media && prop.startsWith('--') && !allowedInQuery.has(prop)) {
        flag('error', 'scalar-in-query', rel, line,
          `${prop} is redefined inside ${b.media.trim()}.`,
          `Only structural values may step. Allowed here: ${[...allowedInQuery].join(', ') || '(none)'}. Everything else must interpolate via clamp().`);
      }

      // --- raw hex where a token should be ------------------------------
      const hex = value.match(/#[0-9a-fA-F]{3,8}\b/);
      if (hex && !prop.startsWith('--')) {
        flag('warn', 'raw-hex', rel, line,
          `${prop} uses a literal colour (${hex[0]}).`,
          'Reference a colour token so themes and contrast fixes apply everywhere at once.');
      }

      // --- fixed height on a tap target ---------------------------------
      if (prop === 'height' && /^\d/.test(value) && isInteractive(b.selector)) {
        flag('warn', 'fixed-height-target', rel, line,
          `${b.selector.trim()} sets height: ${value}.`,
          'Use min-height, never height, for anything you tap. That way fluid padding can only ever make a target bigger, never smaller.');
      }

      // --- pinned column sized as a percentage ---------------------------
      if (/^(width|min-width|flex-basis)$/.test(prop) && /%\s*$/.test(value) && isPinned(b.decls)) {
        flag('error', 'pinned-percentage', rel, line,
          `A position:sticky column is sized in % (${prop}: ${value}).`,
          'Percentages and pinned columns do not mix. At 390px a 30% pinned column ate 250px of a 520px table, leaving ~64px to actually scroll. Pinned columns must be absolute.');
      }

      // --- button label must not shrink ----------------------------------
      if (prop === 'font-size' && isClamped(value) && /button|\.btn\b|\[type=["']?(submit|button)/i.test(b.selector) && profile.static?.buttonLabelSize) {
        flag('warn', 'fluid-button-label', rel, line,
          `${b.selector.trim()} makes the button label fluid.`,
          `${profile.static.buttonLabelNote ?? 'Button labels stay static.'} This profile pins it at ${profile.static.buttonLabelSize}px.`);
      }
    }

    // --- truncation that silently does nothing ---------------------------
    const ellipsis = b.decls.find((d) => d.prop === 'text-overflow' && /ellipsis/.test(d.value));
    if (ellipsis) {
      const has = (p, re) => b.decls.some((d) => d.prop === p && re.test(d.value));
      const display = b.decls.find((d) => d.prop === 'display')?.value ?? '';
      if (!has('overflow', /hidden|clip|auto|scroll/))
        flag('error', 'inert-ellipsis', rel, ellipsis.line,
          'text-overflow: ellipsis without overflow: hidden.',
          'The ellipsis needs all three of overflow, white-space and a block-level box. Miss one and it silently does nothing — the text just spills into its neighbour.');
      if (!has('white-space', /nowrap|pre\b/))
        flag('error', 'inert-ellipsis', rel, ellipsis.line,
          'text-overflow: ellipsis without white-space: nowrap.',
          'Without nowrap the text wraps instead of truncating, so the ellipsis never triggers.');
      if (/(^|[\s,>+~])(td|th)\b/.test(b.selector.trim()) || /table-cell|^inline$/.test(display))
        flag('error', 'inert-ellipsis', rel, ellipsis.line,
          `text-overflow: ellipsis applied directly to ${/table-cell|inline/.test(display) ? `display: ${display}` : 'a table cell'}.`,
          'It does nothing on inline text or on a table cell itself. Render every cell and header label inside one block-level wrapper and put the rule there.');
    }
  }
}

/**
 * Every breakpoint must answer a question in plain words. If it can't, it is
 * a value that should have been a clamp. The registry lives in the profile so
 * the question is reviewable, not folded into a stylesheet.
 */
function auditBreakpoints(file, profile, rel) {
  const registry = profile.structural?.breakpoints;
  if (!registry?.length) return;
  const known = new Set(registry.map((b) => b.width));
  const lines = stripComments(readFileSync(file, 'utf8')).split('\n');

  lines.forEach((line, i) => {
    const m = [...line.matchAll(/@media[^{]*?\(\s*(?:min|max)-width\s*:\s*(\d+(?:\.\d+)?)px/g)];
    for (const hit of m) {
      const w = parseFloat(hit[1]);
      // max-width queries conventionally sit one pixel under the step
      if (known.has(w) || known.has(w + 1) || known.has(w - 1)) continue;
      flag('error', 'unregistered-breakpoint', rel, i + 1,
        `Breakpoint at ${w}px is not in the profile's breakpoint registry.`,
        `Registered: ${[...known].sort((a, b) => a - b).join(', ')}px. Add it with the question it answers, or make the value a clamp(). A breakpoint that can't answer a question out loud shouldn't exist.`);
    }
  });
}

const isInteractive = (sel) =>
  /button|\bbtn\b|\ba\b|\[role|input|select|textarea|tab|nav|link|chip|toggle|checkbox|radio/i.test(sel);

const isPinned = (decls) =>
  decls.some((d) => d.prop === 'position' && /sticky|fixed/.test(d.value));

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.paths.length) {
    console.error('usage: node scripts/audit.mjs <file-or-dir...> [--profile <profile.json>] [--json]');
    process.exit(2);
  }

  const profile = JSON.parse(
    readFileSync(args.profile ? resolve(args.profile) : join(__dirname, '..', 'profiles', 'default.json'), 'utf8')
  );

  const files = args.paths.flatMap((p) => walk(resolve(p)));
  const cwd = process.cwd();
  for (const f of files) {
    const rel = relative(cwd, f) || f;
    auditFile(f, profile, rel);
    auditBreakpoints(f, profile, rel);
  }

  const errors = findings.filter((f) => f.severity === 'error');
  const warns = findings.filter((f) => f.severity === 'warn');

  if (args.json) {
    console.log(JSON.stringify({ profile: profile.id, files: files.length, findings, ok: !errors.length }, null, 2));
    process.exit(errors.length ? 1 : 0);
  }

  console.log(`\n  audit — ${profile.name}`);
  console.log(`  ${files.length} file(s) scanned\n`);

  const icon = { error: '✗', warn: '⚠' };
  let lastFile = null;
  for (const f of [...errors, ...warns].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) {
    if (f.file !== lastFile) {
      console.log(`  ${f.file}`);
      lastFile = f.file;
    }
    console.log(`    ${icon[f.severity]} ${String(f.line).padStart(4)}  [${f.rule}] ${f.message}`);
    console.log(`          ${f.why}`);
  }

  if (!findings.length) console.log('  ✓ no violations');
  console.log(`\n  ${errors.length} error(s), ${warns.length} warning(s)\n`);
  process.exit(errors.length ? 1 : 0);
}

main();
