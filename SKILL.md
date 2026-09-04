---
name: fluid-responsive
description: Make a design or codebase responsive using the Utopia fluid method, in either direction — desktop→mobile or mobile→desktop, from scratch, from a Figma design, or from existing code. Asks the structural questions Utopia leaves out (grid, navigation, tables, truncation, header composition, breakpoints) instead of assuming them, then proves the result with executable checks for scale integrity, WCAG contrast judged at the mobile anchor, doctrine violations, and rendered column drift. Use when asked to "make this responsive", "build the mobile version", "scale this design to desktop", "add a fluid type scale", "set up design tokens", "audit our breakpoints", or when Utopia, clamp(), fluid typography, or fluid spacing come up.
---

# Fluid Responsive

Utopia answers *"what size is this at 830px?"* Nothing answers *"what happens to
the navigation at 830px?"* This skill owns the second question.

**Never invent token values, and never write a `clamp()` by hand.** Read the two
anchors, run `generate.mjs`, then validate. The scripts are the source of truth;
this file routes to them.

---

## Step 1 — Detect before you ask

Never ask what you can read.

```bash
node scripts/detect.mjs <project-dir>
```

Recovers existing anchors from the `clamp()` maths itself, plus the token ladder,
static floors, breakpoints in use, and whether the code has tables, pinned
columns, truncation, nav, auto-fit grids or container queries.

Summarise it in one short paragraph, then use every finding as a **proposed
default**. A skill that asks twelve questions with no defaults is a form, and
forms get abandoned.

---

## Step 2 — Place the job on the grid

Two independent axes. Both matter.

### Where the design comes from

| Source | What to do |
|---|---|
| **Nothing** (greenfield) | Start from `profiles/default.json`. Ask Tier 1 in full |
| **Figma** (via Figma MCP) | `get_variable_defs` / `get_design_context` on each frame. Read real values — see `references/figma-bridge.md` |
| **Existing code** | `detect.mjs` recovers the anchors; confirm rather than ask |

### How many anchors actually exist

| | What it means | The rule |
|---|---|---|
| **Both frames** | desktop *and* mobile designs exist | **Read both. Invent nothing.** Each pair is a real design value, so design and build cannot drift at the two widths anyone reviews |
| **One frame only** | just desktop, or just mobile | Derive the missing end — and **say explicitly which numbers are derived**. A derived anchor is a proposal, not a measurement |

That second row is the case people get wrong. Presenting a derived anchor as
though it came from a design throws away the whole guarantee of the method.

### Direction

| Mode | When | What you decide |
|---|---|---|
| `derive-mobile` | desktop exists | what **collapses** — nav, table columns, truncation, header contents |
| `derive-desktop` | mobile exists | what **expands** — measure cap, what fills the space, what to reveal |
| `audit` | anything exists | nothing; run the validators |

`derive-desktop` is not the mirror of `derive-mobile`. The characteristic
mobile-first failure isn't small text — it's a 45ch column stretched across
1440px with nothing beside it. Different bug, different questions.

---

## Step 3 — Ask, in two tiers

Load `references/elicitation.md` for the full bank with defaults.

**Tier 1 — project config**, once, into `.utopia/responsive.json`. Use
`AskUserQuestion`, ≤4 at a time, each with a detected default: anchors and device
floor · column steps, nav pattern, table strategy, drop order · accessibility
floors and contrast target · output format and Figma mode names.

**Tier 2 — per artefact**, at generation time. ≤3 questions, only for ambiguity
detection genuinely couldn't resolve. **Never re-ask Tier 1 here.**

The question most often skipped and most worth asking: *is the mobile nav the
same list as desktop?* Usually not — some items get promoted into the tab bar,
admin tooling gets demoted. That is a product decision, not a layout one.

---

## Step 4 — Generate

```bash
node scripts/generate.mjs --profile <profile.json> --out <tokens.css>
```

Profiles: `default.json` (generic, 320→1440), `ecommerce-dsrt.json` (dense
consumer UI), `pulse.json` (worked example with a real table and breakpoint
registry).

Edit the **profile**, never the generated CSS. Regenerating overwrites it.

---

## Step 5 — Prove it

Four checks. Run them; report failures verbatim rather than paraphrasing.

```bash
node scripts/sweep.mjs    <tokens.css> --profile <p>.json   # scale integrity
node scripts/contrast.mjs <tokens.css> --profile <p>.json   # WCAG at the min anchor
node scripts/audit.mjs    <src-dir>    --profile <p>.json   # doctrine violations
node scripts/measure.mjs  <url>        --profile <p>.json   # rendered drift (needs Playwright)
```

- **`sweep`** — monotonicity, band containment, global bounds, step separation
  across 320–2560px. Catches two roles collapsing to one size at an anchor.
- **`contrast`** — judges every text token at the **minimum** anchor. A 16→18px
  token needs 4.5:1, not the 3:1 it would earn at desktop.
- **`audit`** — clamped floors, px leading/tracking on fluid text, bare `vw`,
  clamped `ch`, scalars inside media queries, inert ellipsis, `%` on a pinned
  column, unregistered breakpoints.
- **`measure`** — the one that needs a browser. A 44px column rendering 52.8px is
  invisible to every other check, because the stylesheet is correct and the
  *layout engine* overruled it.

> Fluid design needs measurement, because its failures are a few pixels wide and
> invisible in review.

Exit codes are non-zero on errors, so all four drop into CI.

---

## The doctrine, in one line

> **Scalar values interpolate and never query. Structural values step and must
> query. Static floors do neither — and never go inside a `clamp()`.**

Read `references/doctrine.md` before deciding which bucket something belongs in,
or before overriding a validator finding.

---

## References — load on demand

| File | Read it when |
|---|---|
| `references/doctrine.md` | deciding scalar vs structural vs static, or overriding a finding |
| `references/elicitation.md` | running Step 3 — full question bank, both directions |
| `references/tables.md` | any data table; the four rules that make one survive the trip |
| `references/structural-patterns.md` | nav, tile grids, carousels, rails, headers, pagination, disclosure |
| `references/gotchas.md` | a validator fired and you want the reasoning |
| `references/figma-bridge.md` | reading from or pushing to Figma variable modes |

---

## Rules

- Never hand-write a `clamp()`. Reference a token or regenerate.
- Never put a tap target, focus ring or button padding inside a `clamp()`.
- Never use `height` on something tappable — always `min-height`.
- Never add a breakpoint that can't answer a question in plain words.
- Never let two different questions share a breakpoint width by accident.
- Never judge contrast by a token's desktop size.
- Never set px line-height or px letter-spacing on fluid text.
- Never wrap a `ch` measure in `clamp()`.
- Never size a pinned column as a percentage.
- Never put `text-overflow: ellipsis` on a `<td>` or on inline text.
- Design at exactly the two anchors. Never mock an intermediate width.
- Write the DOM in phone order; let CSS rearrange for desktop.
- If a validator fails, fix the profile and regenerate. Never edit generated CSS.
