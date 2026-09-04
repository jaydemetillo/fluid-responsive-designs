#!/usr/bin/env node
/**
 * init.mjs — go from whatever references you have to a working token set.
 *
 * Handles all three reference counts uniformly, per token:
 *
 *   two values  → READ.    Both ends are real design values. Invent nothing.
 *   one value   → DERIVE.  Propose the other end and label it as a proposal.
 *   no values   → DEFAULT. Fall back to the base profile's pair.
 *
 * The point of labelling is that the two-anchor method's guarantee — design
 * and build cannot drift at the widths anyone reviews — only holds for ends
 * that came from a design. A derived end is a reasonable estimate, and saying
 * so is the difference between a proposal and a lie.
 *
 * Usage:
 *   node scripts/init.mjs --refs refs.json [--from default] [--out .utopia]
 *   node scripts/init.mjs --out .utopia                  # no references at all
 *
 * refs.json:
 *   {
 *     "name": "My app",
 *     "anchors": { "min": 390, "max": 1440 },
 *     "desktop": { "--font-body-default": 14, "--space-m": 24 },
 *     "mobile":  { "--font-body-default": 12 }
 *   }
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Derivation curve.
 *
 * Body text barely moves between phone and desktop; display type moves a lot.
 * So compress the HEADROOM ABOVE A BASE rather than scaling the whole value —
 * scaling uniformly would shrink body text into illegibility while barely
 * touching a title, which is backwards.
 */
const CURVE = {
  type: { base: 12, compression: 0.6, floor: 12, round: 1 },
  space: { base: 4, compression: 0.6, floor: 4, round: 4 },
};

const kindOf = (name) => (/^--font-|^--text-|font|title|body|heading|caption/i.test(name) ? 'type' : 'space');
const snap = (v, to) => Math.max(to, Math.round(v / to) * to);

/**
 * Prefer the base profile's own ratio for THIS token over the generic curve.
 *
 * The generic curve knows nothing about a token's intent. A page margin is a
 * "custom pair" that travels 16 -> 80 (ratio 0.2) while the ladder travels
 * 16 -> 24 (ratio 0.67); running both through one curve puts the mobile page
 * margin at 48px instead of 16px. The base pair already encodes that intent,
 * so use it when we have it and fall back to the curve only for tokens the
 * base profile has never heard of.
 */
function deriveMobile(desktopPx, kind, basePair) {
  const c = CURVE[kind];
  const v = basePair && basePair[1]
    ? desktopPx * (basePair[0] / basePair[1])
    : c.base + (desktopPx - c.base) * c.compression;
  return Math.max(c.floor, snap(v, c.round));
}

function deriveDesktop(mobilePx, kind, basePair) {
  const c = CURVE[kind];
  const v = basePair && basePair[0]
    ? mobilePx * (basePair[1] / basePair[0])
    : c.base + (mobilePx - c.base) / c.compression;
  return Math.max(c.floor, snap(v, c.round));
}

function parseArgs(argv) {
  const args = { refs: null, from: 'default', out: '.utopia', name: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--refs') args.refs = argv[++i];
    else if (a === '--from') args.from = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--name') args.name = argv[++i];
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  const basePath = existsSync(args.from)
    ? resolve(args.from)
    : join(__dirname, '..', 'profiles', `${args.from}.json`);
  const base = JSON.parse(readFileSync(basePath, 'utf8'));

  const refs = args.refs ? JSON.parse(readFileSync(resolve(args.refs), 'utf8')) : {};
  const desktop = refs.desktop ?? {};
  const mobile = refs.mobile ?? {};

  const profile = structuredClone(base);
  profile.id = refs.id ?? 'project';
  profile.name = args.name ?? refs.name ?? 'Project';
  if (refs.anchors) profile.anchors = refs.anchors;
  profile.derivedFrom = { base: base.id, refs: args.refs ?? null };

  const ledger = [];

  // Union of every token named anywhere: the base scales plus any the
  // references introduce that the base didn't know about.
  const sections = [
    ['type', profile.type],
    ['space', profile.space],
  ];

  for (const [section, holder] of sections) {
    if (!holder?.scale) continue;
    const names = new Set([
      ...Object.keys(holder.scale),
      ...Object.keys(desktop).filter((n) => kindOf(n) === section),
      ...Object.keys(mobile).filter((n) => kindOf(n) === section),
    ]);

    /**
     * A scale is a coherent system, not a bag of values. If the references say
     * body is 12→14 but the base profile was built around a 16px body, its
     * untouched tokens belong to a different system — and grafting them on
     * produces collisions (a "caption" landing on top of body) and inversions.
     *
     * So measure how far the references moved the tokens they do cover, and
     * move the rest by the same factor. The base profile then contributes its
     * SHAPE (the relative steps) rather than its absolute numbers.
     */
    const factors = { min: [], max: [] };
    for (const name of names) {
      const b = holder.scale[name]?.pair;
      if (!b) continue;
      // A "custom pair" like the page margin deliberately travels much further
      // than the ladder (16 -> 80 vs 16 -> 24). Its ratio describes that one
      // token, not the system, so letting it set the factor rescales every
      // other token by an amount nothing else asked for.
      if (holder.scale[name]?.customPair) continue;
      const m = mobile[name] ?? (desktop[name] != null ? deriveMobile(desktop[name], kindOf(name), b) : null);
      const d = desktop[name] ?? (mobile[name] != null ? deriveDesktop(mobile[name], kindOf(name), b) : null);
      if (m != null && b[0]) factors.min.push(m / b[0]);
      if (d != null && b[1]) factors.max.push(d / b[1]);
    }
    const median = (xs) => {
      if (!xs.length) return 1;
      const s = [...xs].sort((a, b) => a - b);
      const mid = s.length >> 1;
      return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
    };
    const fMin = median(factors.min);
    const fMax = median(factors.max);
    const rescaling = Math.abs(fMin - 1) > 0.02 || Math.abs(fMax - 1) > 0.02;

    for (const name of names) {
      const d = desktop[name];
      const m = mobile[name];
      const existing = holder.scale[name];
      const kind = kindOf(name);
      let pair;
      let source;

      if (d != null && m != null) {
        pair = [m, d];
        source = 'read';
      } else if (d != null) {
        pair = [deriveMobile(d, kind, existing?.pair), d];
        source = 'derived-mobile';
      } else if (m != null) {
        pair = [m, deriveDesktop(m, kind, existing?.pair)];
        source = 'derived-desktop';
      } else if (existing && rescaling && !existing.customPair) {
        const c = CURVE[kind];
        pair = [
          Math.max(c.floor, snap(existing.pair[0] * fMin, c.round)),
          Math.max(c.floor, snap(existing.pair[1] * fMax, c.round)),
        ];
        source = 'scaled';
      } else if (existing) {
        pair = existing.pair;
        source = 'default';
      } else {
        continue;
      }

      holder.scale[name] = {
        pair,
        use: existing?.use ?? 'defined from reference',
        ...(existing?.customPair ? { customPair: true } : {}),
        ...(source.startsWith('derived') ? { derived: source === 'derived-mobile' ? 'min' : 'max' } : {}),
      };
      ledger.push({ name, pair, source, kind });
    }

    // Keep the ordering lists in step with whatever the references added.
    const ordered = Object.keys(holder.scale).sort(
      (a, b) => holder.scale[a].pair[0] - holder.scale[b].pair[0]
    );
    if (section === 'type') profile.type.scaleOrder = ordered;
    else profile.space.tokens = ordered;
  }

  /**
   * Rescaling can squeeze two adjacent roles onto the same value — a "caption"
   * landing exactly on body, which sweep.mjs correctly rejects as two roles
   * that are not two roles. Push them apart, but only ever move tokens WE
   * produced: a value read from a design is what the design says, and quietly
   * "fixing" it would defeat the point of reading it.
   */
  const sepMin = profile.type?.minStepSeparation ?? 2;
  const bySource = new Map(ledger.map((l) => [l.name, l.source]));
  const adjustable = (n) => bySource.get(n) === 'scaled' || bySource.get(n) === 'default';
  const nudged = [];
  const conflicts = [];
  const typeFloor = profile.type?.globalBounds?.min ?? CURVE.type.floor;

  for (const anchorIdx of [0, 1]) {
    const order = [...(profile.type?.scaleOrder ?? [])]
      .filter((n) => profile.type.scale[n])
      .sort((a, b) => profile.type.scale[a].pair[anchorIdx] - profile.type.scale[b].pair[anchorIdx]);
    for (let i = 1; i < order.length; i++) {
      const prev = profile.type.scale[order[i - 1]].pair[anchorIdx];
      const cur = profile.type.scale[order[i]];
      if (cur.pair[anchorIdx] - prev >= sepMin) continue;
      const target = prev + sepMin;
      if (adjustable(order[i])) {
        cur.pair[anchorIdx] = target;
        nudged.push(`${order[i]} @${anchorIdx ? 'max' : 'min'} → ${target}px`);
      } else if (adjustable(order[i - 1]) && cur.pair[anchorIdx] - sepMin >= typeFloor) {
        const lower = cur.pair[anchorIdx] - sepMin;
        profile.type.scale[order[i - 1]].pair[anchorIdx] = lower;
        nudged.push(`${order[i - 1]} @${anchorIdx ? 'max' : 'min'} → ${lower}px`);
      } else {
        // Both sides are pinned — one by a design, the other by the readability
        // floor — so there is genuinely no room between them. That is a design
        // decision, not something to paper over silently.
        conflicts.push({
          anchor: anchorIdx ? 'max' : 'min',
          width: anchorIdx ? profile.anchors.max : profile.anchors.min,
          lower: order[i - 1],
          upper: order[i],
          value: cur.pair[anchorIdx],
          floor: typeFloor,
        });
      }
    }
  }

  // Separation may have pushed a min past its own max.
  for (const spec of Object.values(profile.type?.scale ?? {}))
    if (spec.pair[0] > spec.pair[1]) spec.pair[1] = spec.pair[0];

  profile.type.scaleOrder = [...(profile.type?.scaleOrder ?? [])].sort(
    (a, b) => profile.type.scale[a].pair[0] - profile.type.scale[b].pair[0]
  );

  // A band that no longer contains its own tokens is worse than no band, so
  // widen the bounds to whatever the real values turned out to be.
  for (const spec of Object.values(profile.type?.bands ?? {})) {
    const vals = (spec.tokens ?? []).flatMap((t) => profile.type.scale[t]?.pair ?? []);
    if (!vals.length) continue;
    spec.min = Math.min(spec.min, ...vals);
    spec.max = Math.max(spec.max, ...vals);
  }
  const allType = Object.values(profile.type?.scale ?? {}).flatMap((s) => s.pair);
  if (allType.length && profile.type?.globalBounds) {
    profile.type.globalBounds.min = Math.min(profile.type.globalBounds.min, ...allType);
    profile.type.globalBounds.max = Math.max(profile.type.globalBounds.max, ...allType);
  }

  // ---- write ------------------------------------------------------------
  const outDir = resolve(args.out);
  mkdirSync(outDir, { recursive: true });
  const profilePath = join(outDir, 'profile.json');
  const configPath = join(outDir, 'responsive.json');

  writeFileSync(profilePath, JSON.stringify(profile, null, 2) + '\n', 'utf8');
  writeFileSync(
    configPath,
    JSON.stringify(
      {
        profile: './profile.json',
        anchors: profile.anchors,
        references: {
          desktop: Object.keys(desktop).length ? 'provided' : 'none',
          mobile: Object.keys(mobile).length ? 'provided' : 'none',
        },
        decisions: {
          note: 'Answers recorded here are not re-asked. Delete a key to be asked again.',
          columnSteps: profile.structural?.columnSteps ?? null,
          navPattern: profile.structural?.navPattern ?? null,
          tableStrategy: profile.structural?.tableStrategy ?? null,
          dropOrder: profile.structural?.tableRules?.dropOrder ?? null,
        },
      },
      null,
      2
    ) + '\n',
    'utf8'
  );

  // ---- report -----------------------------------------------------------
  const counts = { read: 0, 'derived-mobile': 0, 'derived-desktop': 0, scaled: 0, default: 0 };
  for (const l of ledger) counts[l.source]++;
  const refCount = (Object.keys(desktop).length ? 1 : 0) + (Object.keys(mobile).length ? 1 : 0);

  console.log(`\n  init — ${profile.name}`);
  console.log(`  ${refCount} reference set(s) supplied · anchors ${profile.anchors.min}px → ${profile.anchors.max}px\n`);

  const label = {
    read: 'READ    ',
    'derived-mobile': 'DERIVED ',
    'derived-desktop': 'DERIVED ',
    scaled: 'SCALED  ',
    default: 'DEFAULT ',
  };
  for (const l of ledger.sort((a, b) => a.kind.localeCompare(b.kind) || a.pair[0] - b.pair[0])) {
    const arrow = `${l.pair[0]} → ${l.pair[1]}`;
    const note =
      l.source === 'derived-mobile' ? '  (mobile end proposed)' :
      l.source === 'derived-desktop' ? '  (desktop end proposed)' : '';
    console.log(`  ${label[l.source]} ${l.name.padEnd(26)} ${arrow.padStart(11)}${note}`);
  }

  const derivedN = counts['derived-mobile'] + counts['derived-desktop'];
  console.log(`\n  ${counts.read} read from a design, ${derivedN} derived, ${counts.scaled} rescaled to fit, ${counts.default} from the ${base.id} profile`);
  if (counts.scaled)
    console.log(`  Rescaled tokens keep the ${base.id} profile's step SHAPE, resized into your references' range.`);

  if (derivedN > 0) {
    console.log('\n  ⚠ Derived values are PROPOSALS, not measurements. Say so when you');
    console.log('    present them, and get a designer to confirm before they harden.');
  }

  if (conflicts.length) {
    console.log('\n  ⚠ DECISIONS NEEDED — these cannot be resolved automatically:\n');
    for (const c of conflicts) {
      console.log(`    ${c.lower} and ${c.upper} both sit at ${c.value}px at the ${c.width}px anchor,`);
      console.log(`    and ${c.value}px is already the readability floor, so nothing fits beneath it.`);
      console.log('');
      console.log(`      a) Drop "${c.lower}" — if body is at the floor, a smaller role has nowhere to go`);
      console.log(`      b) Raise "${c.upper}" so a step opens up underneath it`);
      console.log(`      c) Keep both and differentiate by WEIGHT rather than size`);
      console.log(`      d) Lower the floor (globalBounds.min) — only if you have tested it on a phone`);
      console.log('');
    }
    console.log('    Until one is chosen, sweep.mjs will keep reporting this as an error.');
    console.log('    That is correct: two roles that render identically are not two roles.\n');
  }

  if (nudged.length) {
    console.log(`\n  Nudged ${nudged.length} generated value(s) apart to keep roles distinguishable:`);
    for (const n of nudged) console.log(`    ${n}`);
    console.log('    (values read from a design were left untouched)');
  }

  console.log(`\n  wrote ${profilePath}`);
  console.log(`  wrote ${configPath}`);
  console.log('\n  next:');
  console.log(`    node scripts/generate.mjs --profile ${profilePath} --out tokens.css`);
  console.log(`    node scripts/sweep.mjs tokens.css --profile ${profilePath}\n`);
}

main();
