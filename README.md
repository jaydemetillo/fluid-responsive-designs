# fluid-responsive-designs

The layer [Utopia](https://utopia.fyi) leaves out — plus the checks that prove it.

Utopia answers *"what size is this at 830px?"* Nothing answers *"what happens to
the navigation at 830px?"* This repo owns the second question, and ships
executable checks for the failures that only appear between the anchors.

---

## Why this exists

The Utopia ecosystem — [utopia.fyi](https://utopia.fyi),
[utopia-core](https://github.com/trys/utopia-core),
[utopia-core-scss](https://github.com/trys/utopia-core-scss),
[postcss-utopia](https://github.com/trys/postcss-utopia),
[tailwind-utopia](https://github.com/cwsdigital/tailwind-utopia) — is five
implementations of one calculation: given two viewport anchors, interpolate type
and space with `clamp()`.

None of them asks a question, because Utopia's thesis is that once the anchors
are fixed there is nothing left to decide.

That thesis is true **for scalars**. It says nothing about what happens to the
navigation at 830px, whether a six-column table becomes a card list, what the
mobile header contains, or whether a 44px tap target survives being clamped.
Those decisions are real, they recur on every screen, and they currently get
made ad-hoc.

None of them can tell you that your 44px column is rendering at 52.8px, either.

---

## The doctrine, in one line

> **Scalar values interpolate and never query. Structural values step and must
> query. Static floors do neither — and never go inside a `clamp()`.**

| | **Scalar** | **Structural** | **Static** |
|---|---|---|---|
| Examples | font size, padding, gap, gutter, measure | column count, nav pattern, table strategy, disclosure | tap target, focus ring, button padding, radii |
| Implementation | `clamp()` | media / container query | a plain number |
| Media query? | never | **yes — this is what they're for** | never |
| Inside a `clamp()`? | always | never | **never** |

Full reasoning in [`references/doctrine.md`](references/doctrine.md).

---

## The four checks

```bash
node scripts/sweep.mjs    tokens.css --profile profiles/default.json
node scripts/contrast.mjs tokens.css --profile profiles/default.json
node scripts/audit.mjs    src/       --profile profiles/default.json
node scripts/measure.mjs  http://localhost:3000 --profile profiles/default.json
```

**`sweep`** — scale integrity across 320–2560px: monotonicity, band containment,
global bounds, and step separation. Catches two roles collapsing to the same
size at one anchor while looking fine at the other.

**`contrast`** — WCAG judged at the **minimum** anchor. A token running 16→18px
earns the 3:1 large-text allowance at 1440px and does *not* earn it at 390px.
Judge it at desktop and you ship text failing 4.5:1 at most real widths. The
script reports these as *fluid traps* explicitly.

**`audit`** — clamped accessibility floors, px line-height or letter-spacing on
fluid text, bare `vw` font sizes, `clamp()` around a `ch` measure, scalars
redefined inside a media query, inert `text-overflow`, `%` on a pinned column,
and breakpoints missing from the profile's registry.

**`measure`** — the one that needs a browser. A fixed 44px column measured
52.8px at 768px because CSS table layout redistributed leftover space. The
stylesheet was correct; the layout engine overruled it. No static analysis finds
that.

> Fluid design needs measurement, because its failures are a few pixels wide and
> invisible in review.

All four exit non-zero on errors, so they drop straight into CI.

---

## Quick start

```bash
git clone https://github.com/jaydemetillo/fluid-responsive-designs.git
cd fluid-responsive-designs
node test/run.mjs          # 15 proofs (13 with no install at all)
```

Everything runs on plain Node ≥18 with zero dependencies. `utopia-core` is an
optional dependency used when present; the built-in fallback produces identical
output, which `test/idempotence.mjs` proves against a hand-verified token file.
Only `measure.mjs` needs anything installed:

```bash
npm i -D playwright && npx playwright install chromium
```

### Start from whatever references you have

`init.mjs` handles all three cases. It never asks for a frame you don't have.

```bash
# no design at all
node scripts/init.mjs --out .utopia

# one frame, or two — put whichever values you have into refs.json
node scripts/init.mjs --refs refs.json --out .utopia

node scripts/generate.mjs --profile .utopia/profile.json --out tokens.css
node scripts/sweep.mjs tokens.css --profile .utopia/profile.json
```

```json
{
  "anchors": { "min": 390, "max": 1440 },
  "desktop": { "--font-body-default": 14, "--space-m": 24 },
  "mobile":  { "--font-body-default": 12 }
}
```

Every token is labelled by how it was resolved:

| Label | Meaning |
|---|---|
| `READ` | both ends came from a design — nothing invented |
| `DERIVED` | one end came from a design; the other is **a proposal**, and says so |
| `SCALED` | no reference; the base profile's step *shape*, resized into your range |
| `DEFAULT` | no reference and no rescaling |

Unreferenced tokens are rescaled rather than left at base values, because a
scale is a coherent system — grafting a stranger's caption onto your body text
produces collisions. When two roles genuinely cannot be separated (both pinned,
with the readability floor beneath them), it prints a **DECISIONS NEEDED** block
with real options instead of quietly fudging a number.

Edit the **profile**, never the generated CSS.

### Inspect an existing project

```bash
node scripts/detect.mjs ./my-app
```

Recovers the anchors from the `clamp()` maths itself — an existing token file
tells you its own anchors without being asked.

---

## Worked examples

Three scenarios built end to end through the skill and validated with all four
checks — see [`examples/`](examples/README.md).

| | Scenario | References |
|---|---|---|
| **S1** | Item Catalogue, desktop → mobile | one Figma frame |
| **S2** | Station Dashboard, mobile → desktop | one Figma frame |
| **S3** | Equipment checks table | **none** |

```bash
python3 -m http.server 4178 --directory examples
```

Building them surfaced four real bugs, including a pinned column that declared
170px and rendered 195px — the doctrine's own Rule 1, violated in our own build
and caught only by measuring a live browser.

---

## Profiles

| Profile | What it is |
|---|---|
| `default.json` | Generic, 320→1440, 16px body. Start here |
| `ecommerce-dsrt.json` | Dense consumer UI with deliberately small type bands |
| `pulse.json` | Worked example: real frame values, a pinned-column table, a breakpoint registry |

A profile carries the anchors, the token pairs, the bands, the static floors,
the structural allowlist, the breakpoint registry, and the measurement
assertions. It is the single source of truth; the scripts only read it.

---

## Using it with your AI tool

Same rules, three wrappers. Full steps in [`INSTALL.md`](INSTALL.md).

| Tool | File it reads | Setup |
|---|---|---|
| **Claude Code** | `SKILL.md` | `ln -s "$PWD" ~/.claude/skills/fluid-responsive` |
| **Codex** | `AGENTS.md` | copy `AGENTS.md` into your project root |
| **Cursor** | `.cursor/rules/fluid-responsive.mdc` | copy into your project's `.cursor/rules/` |

In Claude Code it becomes the **Fluid Responsive** skill (`/fluid-responsive`),
and triggers on its own from phrases like "make this responsive" or "build the
mobile version". In Cursor the rule attaches automatically when you touch CSS,
SCSS, Tailwind config or token files.

All three build first and ask second. Questions are reserved for the cases a
tool genuinely cannot settle — a product decision (is the mobile nav the same
list as desktop?), a choice that reshapes the DOM (does a table become cards?),
or a real conflict between sources. Everything else gets a sensible default and
a one-line note saying what was assumed, which is cheaper to correct than a
question is to answer.

---

## Repository layout

```
SKILL.md                  Claude Code skill entry point
AGENTS.md                 Codex (and any agent that reads AGENTS.md)
.cursor/rules/            Cursor rule
INSTALL.md                setup for all three
profiles/                 the source of truth: anchors, pairs, floors, registry
references/               doctrine, elicitation bank, tables, patterns, gotchas, Figma
scripts/
  detect.mjs              read before you ask; recovers anchors from clamps
  init.mjs                0, 1 or 2 references -> a working profile
  generate.mjs            profile → fluid-tokens.css
  sweep.mjs               scale integrity across the viewport range
  contrast.mjs            WCAG judged at the minimum anchor
  audit.mjs               doctrine violations in a codebase
  measure.mjs             rendered drift on a live page (Playwright)
test/                     8 proofs that each validator catches its own bug
```

---

## Credit

The fluid method is [Utopia](https://utopia.fyi) by Trys Mudford and James
Gilyead. This repo depends on their maths and adds only the surrounding
decisions and checks.

MIT.
