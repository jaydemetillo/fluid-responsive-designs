/**
 * CSS custom-property parsing and length evaluation.
 *
 * Shared by sweep.mjs, contrast.mjs and audit.mjs. The whole point of this
 * file is to answer one question: "what does this token actually resolve to
 * at viewport width W?" — because every fluid bug in the doctrine is a bug
 * that only appears at one end of the range.
 */

const DECL = /(--[A-Za-z0-9_-]+)\s*:\s*([^;}]+)[;}]/g;

/** Parse every custom-property declaration in a CSS string. */
export function parseTokens(css) {
  const tokens = new Map();
  let m;
  DECL.lastIndex = 0;
  while ((m = DECL.exec(css)) !== null) {
    const [, name, rawValue] = m;
    const value = rawValue.trim();
    // Later declarations win (media-query overrides), but we keep the first
    // :root value as the base and record overrides separately.
    if (tokens.has(name)) {
      tokens.get(name).overrides.push(value);
    } else {
      tokens.set(name, { name, value, overrides: [] });
    }
  }
  return tokens;
}

/** Split on top-level commas, respecting nested parentheses. */
function splitTopLevel(str, sep = ',') {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of str) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === sep && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Extract the contents of the outermost fn(...) call. */
function inner(str) {
  const open = str.indexOf('(');
  return str.slice(open + 1, str.lastIndexOf(')'));
}

const TERM = /([+-])?\s*(\d*\.?\d+)\s*(rem|em|px|vw|vi|vh|vmin|vmax|ch|%)?/g;

function sumTerms(str, ctx) {
  let total = 0;
  let matched = false;
  TERM.lastIndex = 0;
  let m;
  while ((m = TERM.exec(str)) !== null) {
    const sign = m[1] === '-' ? -1 : 1;
    const n = parseFloat(m[2]);
    const unit = m[3];
    matched = true;
    switch (unit) {
      case 'rem':
      case 'em':
        total += sign * n * ctx.root;
        break;
      case 'px':
        total += sign * n;
        break;
      case 'vw':
      case 'vi':
      case 'vmin':
        total += sign * (n / 100) * ctx.width;
        break;
      case 'vh':
      case 'vmax':
        total += sign * (n / 100) * (ctx.height ?? ctx.width);
        break;
      case 'ch':
        // ch is relative to the font size, not the viewport. Callers that
        // care about measure pass ctx.fontSize; otherwise it is meaningless.
        total += sign * n * (ctx.fontSize ?? ctx.root) * 0.5;
        break;
      case '%':
        total += sign * n; // percentages are context-dependent; returned raw
        break;
      default:
        total += sign * n; // unitless (line-height, --grid-columns, 0)
    }
  }
  return matched ? total : NaN;
}

function resolveVars(str, ctx, seen = new Set()) {
  let out = str;
  let guard = 0;
  while (out.includes('var(') && guard++ < 20) {
    const idx = out.indexOf('var(');
    // find matching close paren
    let depth = 0;
    let end = idx;
    for (let i = idx + 3; i < out.length; i++) {
      if (out[i] === '(') depth++;
      else if (out[i] === ')') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const args = splitTopLevel(out.slice(idx + 4, end));
    const name = args[0];
    const fallback = args[1];
    let replacement;
    if (seen.has(name)) {
      replacement = null; // circular
    } else if (ctx.vars?.has(name)) {
      const nested = new Set(seen).add(name);
      const v = evalLength(ctx.vars.get(name).value, ctx, nested);
      replacement = Number.isNaN(v) ? null : `${v}px`;
    } else if (fallback !== undefined) {
      replacement = fallback;
    } else {
      replacement = null;
    }
    if (replacement === null) return NaN;
    out = out.slice(0, idx) + replacement + out.slice(end + 1);
  }
  return out;
}

/**
 * Evaluate a CSS length expression to pixels at a given viewport width.
 * Returns NaN for anything that isn't a resolvable length.
 */
export function evalLength(raw, ctx, seen = new Set()) {
  if (raw == null) return NaN;
  let s = String(raw).trim();

  if (s.includes('var(')) {
    const resolved = resolveVars(s, ctx, seen);
    if (typeof resolved !== 'string') return NaN;
    s = resolved.trim();
  }

  const fn = s.slice(0, s.indexOf('(')).trim().toLowerCase();

  if (s.startsWith('clamp(')) {
    const [lo, pref, hi] = splitTopLevel(inner(s)).map((a) => evalLength(a, ctx, seen));
    if ([lo, pref, hi].some(Number.isNaN)) return NaN;
    return Math.min(Math.max(pref, lo), hi);
  }
  if (fn === 'calc') return evalLength(inner(s), ctx, seen);
  if (fn === 'min') return Math.min(...splitTopLevel(inner(s)).map((a) => evalLength(a, ctx, seen)));
  if (fn === 'max') return Math.max(...splitTopLevel(inner(s)).map((a) => evalLength(a, ctx, seen)));

  return sumTerms(s, ctx);
}

/** Convenience: resolve one token name to px at a width. */
export function tokenAt(tokens, name, width, root = 16) {
  const t = tokens.get(name);
  if (!t) return NaN;
  return evalLength(t.value, { width, root, vars: tokens });
}

/** Is this declaration a clamp()? Used by the audit to catch clamped floors. */
export function isFluid(value) {
  return /clamp\s*\(/i.test(String(value));
}

export const round = (n, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;
