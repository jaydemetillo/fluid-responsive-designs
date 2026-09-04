---
name: fluid-responsive
description: Make a design work across phone and desktop widths, in either direction — desktop to mobile or mobile to desktop — starting from a Figma design, from existing code, or from nothing at all. Works whether you have two design frames, one, or none. Builds working sizes immediately from whatever exists, clearly marks anything it had to guess, and asks only the handful of questions a tool genuinely cannot answer for you. Then checks the result: sizes that collide or invert, text that fails colour contrast at phone size, tap targets that shrink below 44px, and table columns that render wider than they were told to. Use when asked to "make this responsive", "build the mobile version", "scale this design to desktop", "add a fluid type scale", "set up design tokens", "audit our breakpoints", or when Utopia, clamp(), fluid typography, or fluid spacing come up.
---

# Fluid Responsive

Utopia answers *"what size is this at 830px?"* Nothing answers *"what happens to
the navigation at 830px?"* This skill owns the second question.

**Build first. Ask only what building revealed.** Never hand-write a `clamp()`;
never invent a token value silently. The scripts are the source of truth.

---

## Step 1 — Detect (no questions)

```bash
node scripts/detect.mjs <project-dir>
```

Recovers the anchors from the `clamp()` maths itself, plus the token ladder,
static floors, breakpoints in use, and whether the code has tables, pinned
columns, truncation, nav, auto-fit grids or container queries.

Never ask anything this already answered.

---

## Step 2 — Build immediately

Collect whatever references exist into a `refs.json` — **do not ask for the ones
that don't exist**:

```json
{
  "name": "My app",
  "anchors": { "min": 390, "max": 1440 },
  "desktop": { "--font-body-default": 14, "--space-m": 24 },
  "mobile":  { "--font-body-default": 12 }
}
```

From Figma, `get_variable_defs` on each frame fills these in. From existing code,
`detect.mjs` does. From nothing, omit both keys.

```bash
node scripts/init.mjs --refs refs.json --out .utopia
node scripts/generate.mjs --profile .utopia/profile.json --out tokens.css
```

`init.mjs` resolves every token by whatever evidence it has, and **labels each
one**:

| Label | Meaning |
|---|---|
| `READ` | both ends came from a design. Invent nothing here |
| `DERIVED` | one end came from a design, the other is **a proposal** |
| `SCALED` | no reference; the base profile's step *shape*, resized to fit your references |
| `DEFAULT` | no reference and no rescaling; straight from the base profile |

It writes `.utopia/profile.json` and `.utopia/responsive.json`. The second file
records decisions so they are **never re-asked** — delete a key to be asked again.

**Always report the DERIVED values as proposals.** The two-anchor method's whole
guarantee is that both ends are real. A derived end is a reasonable estimate, and
saying so is the difference between a proposal and a lie.

---

## Step 3 — Validate

```bash
node scripts/sweep.mjs    tokens.css --profile .utopia/profile.json
node scripts/contrast.mjs tokens.css --profile .utopia/profile.json
node scripts/audit.mjs    src/       --profile .utopia/profile.json
node scripts/measure.mjs  <url>      --profile .utopia/profile.json   # needs Playwright
```

- **`sweep`** — monotonicity, band containment, global bounds, step separation
  across 320–2560px. Catches two roles collapsing to one size at an anchor.
- **`contrast`** — judges every text token at the **minimum** anchor. A 16→18px
  token needs 4.5:1, not the 3:1 it would earn at desktop.
- **`audit`** — clamped floors, px leading/tracking on fluid text, bare `vw`,
  clamped `ch`, scalars inside media queries, inert ellipsis, `%` on a pinned
  column, unregistered breakpoints.
- **`measure`** — the one needing a browser. A 44px column rendering 52.8px is
  invisible to every other check: the stylesheet is correct and the *layout
  engine* overruled it.

> Fluid design needs measurement, because its failures are a few pixels wide and
> invisible in review.

---

## Step 4 — Ask only what's left

`init.mjs` prints a **DECISIONS NEEDED** block when it hits something it cannot
resolve — for example two roles pinned onto the same size with the readability
floor beneath them. Put those to the user with the options it listed.

Beyond that, the bar for asking is high. **Ask only if one of these is true:**

1. It is a **product or content** decision no tool can derive.
2. Getting it wrong is **expensive to reverse** (it shapes the DOM, not a value).
3. Detection found a **genuine conflict** between two sources.

Everything else: pick the sensible default, **build it, and say what you
assumed** in one line. An assumption stated plainly is cheaper for everyone than
a question asked upfront — the user corrects it in a sentence if it's wrong.

### Worth asking

| Question | Why it clears the bar |
|---|---|
| Is the mobile nav the same list as desktop? | Product decision. Items get *promoted* into a tab bar and others *demoted*; no tool can derive that |
| Table drop order as it narrows? | Ranking by decision-value-per-pixel needs domain knowledge |
| Below ~560px: scroll sideways, or rows become cards? | Depends on whether people scan or read. Changes the markup |
| What must never truncate? | A product name is how someone identifies a row |
| What fills the space on desktop? | Widening isn't "the same design, bigger" — something must earn the room |

Ask these **only when the relevant thing exists.** No table means no table
questions.

### Not worth asking — assume and state

Anchors · device floor (320) · column steps (4/8/12) · tap and focus floors ·
contrast target (AA) · output format · line-height and tracking units · whether
button padding is static. All have a correct or conventional answer. State it,
don't ask it.

### Never ask

Anything `detect.mjs` already answered. Anything in `.utopia/responsive.json`.
Anything you asked earlier in the session.

---

## Reference counts — all three work

| References | What happens |
|---|---|
| **Two frames** | Every referenced token is `READ`. This is the good case |
| **One frame** | The missing end is `DERIVED` using that token's own base ratio, and labelled a proposal |
| **None** | Everything is `DEFAULT`. You get working, validated tokens with zero input |

Unreferenced tokens are `SCALED` into the referenced range rather than left at
base values — a scale is a coherent system, and grafting a stranger's caption
onto your body text produces collisions.

---

## Direction

`derive-desktop` is not the mirror of `derive-mobile`. Going down you decide what
**collapses**: nav, columns, truncation, header contents. Going up you decide what
**expands**: the characteristic mobile-first failure isn't small text, it's a 45ch
column stranded in 1440px with nothing beside it.

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
| `references/elicitation.md` | you need the full question bank for either direction |
| `references/tables.md` | any data table; the four rules that make one survive the trip |
| `references/structural-patterns.md` | nav, tile grids, carousels, rails, headers, pagination, disclosure |
| `references/gotchas.md` | a validator fired and you want the reasoning |
| `references/figma-bridge.md` | reading from or pushing to Figma variable modes |

---

## Rules

- Never hand-write a `clamp()`. Reference a token or regenerate.
- Never present a derived value as though it came from a design.
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
