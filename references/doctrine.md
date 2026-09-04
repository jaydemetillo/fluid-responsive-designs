# Doctrine — scalar, structural, static

Everything in this repo derives from one classification. Get a value into the
right bucket and the correct implementation is no longer a judgement call.

---

## The three buckets

| | **Scalar** | **Structural** | **Static** |
|---|---|---|---|
| Shape of the value | continuous range | discrete states | one value, forever |
| Implementation | `clamp()` | media / container query | a plain number |
| Media query? | **never** | **yes — this is what they're for** | never |
| Inside a `clamp()`? | always | never | **never** |

**Scalar** — font size, padding, gap, margin, grid gutter, container width, measure.
There is a defensible value at every width, so interpolate. A breakpoint here is
a bug: it produces a visible jump where the maths already had a smooth answer.

**Structural** — grid column count, navigation pattern, layout topology, disclosure
pattern, table strategy. There is *no* defensible value at 830px between "3 columns"
and "2 columns". The value is discrete, so it must step, and a query is the correct
tool. Utopia has nothing to say here, which is why so many Utopia projects have a
beautiful type scale and an incoherent tablet layout.

**Static** — tap target 44px, click target 24px, focus ring 2px/2px offset,
interactive gap 8px, border widths, radii, button padding. These are floors, not
sizes. They do not get to shrink because the viewport did.

---

## Why the static bucket is not just "scalar with a small range"

This is the distinction that breaks most fluid design systems.

```css
/* WRONG — reads 44px only at 1440px, and is under 44px everywhere below it */
min-height: clamp(2rem, 1.5rem + 1vw, 2.75rem);

/* RIGHT — floor is a floor; fluid padding grows it from there */
min-height: var(--tap-target-min);   /* 44px, always */
padding-block: var(--pad-btn-md-block);
```

A clamped tap target passes inspection at the desktop anchor, which is exactly
where nobody is tapping. It fails silently at every touch width. `audit.mjs`
flags this as `clamped-floor`, and it is the single most common violation in
codebases that adopt Utopia enthusiastically.

The same argument covers focus rings. A 2px ring that interpolates down to 1px
on mobile is a 1px ring on the devices with the worst contrast conditions.

---

## Why button padding is static, not scalar

Buttons are hit targets before they are layout. If padding is fluid, it shrinks
as the viewport narrows — fighting the 44px floor at precisely the widths where
the floor matters most. Fix the padding; let `min-height` guarantee the floor.

---

## The one honest amendment

A common house rule says *"column count is the only thing allowed a media query."*
That is very nearly right, and it is too strict by a little.

A desktop navigation bar becoming a hamburger is not a scalar change. Neither is
a six-column table becoming a card list, nor a sidebar becoming a bottom sheet.
These are discrete reconfigurations with no meaningful in-between state. Forbidding
a query for them doesn't make them fluid — it just pushes the same conditional
into JavaScript, or into a `display: none` pair that ships both DOM trees.

So the rule this repo uses:

> **Structural changes may query. Scalar changes never may.**

The allowlist is explicit in each profile (`structural.allowedMediaQueryProps`),
so a query on anything else is a lint error rather than a matter of taste. Start
narrow — column count only — and add to the list deliberately.

Container queries are usually the better tool for a *component's* structural
steps, because a card doesn't care how wide the viewport is, only how wide its
own slot is. Reserve media queries for page-level topology.

---

## What the 4pt grid actually governs

The grid governs **the anchors, not the interpolation**.

Every space token resolves to an exact 4pt multiple at the min anchor and at the
max anchor. Between them the browser produces off-grid intermediates — card
padding is 19.4px at 830px — and **this is correct, not a violation**. The grid
is a design-decision constraint, not a runtime one.

This is why you design at exactly two widths and never mock an intermediate:
there is nothing to decide there, the maths already answered it. `sweep.mjs`
enforces 4pt at the anchors and deliberately ignores everything between.

---

## Line height, letter spacing, measure

Three corollaries of "the type is fluid, so anything coupled to it must be too":

- **Line height must be unitless** (`1.5`, not `24px`). Unitless multiplies the
  computed font size, so it tracks automatically. A px value desynchronises and
  clips descenders at one end of the range.
- **Letter spacing must be in `em`** (`-0.015em`, not `-0.4px`). Same reason.
- **Measure must be in `ch`, and must not be clamped.** `ch` is already relative
  to the font size, so a `max-width: 75ch` is fluid for free. Wrapping it in
  `clamp()` nests two independent fluid systems and the result is unpredictable.

---

## Judge contrast at the minimum anchor

WCAG's "large text" threshold (18px, or 14px bold) is a **fixed** number. Fluid
font sizes are not. A token running 16px → 18px qualifies for the relaxed 3:1
allowance at 1440px and does not qualify at 390px.

> **Always test a token's contrast against its value at the minimum anchor.**

Only tokens whose *minimum* is already ≥18px may use the 3:1 allowance. This is
mechanised in `contrast.mjs`, which reports the case explicitly as a *fluid trap*
— a pairing whose required ratio changes across the range.

The failure is invisible to eyeballs and to every colour tool on the market,
because those tools ask you for a size and you naturally give them the one you
designed at.

---

## A token is a claim. The rendered pixel is the fact.

`sweep.mjs` proves your arithmetic. It cannot prove your layout, and they are
not the same claim.

A checkbox column with a fixed 44px token measured **52.8px at 768px**. Nothing
in the CSS was wrong. CSS table layout distributes leftover space across every
column when no column volunteers to absorb it, so the layout engine quietly
overruled the token. Meanwhile a general rule elsewhere in the stylesheet
outranked a column-specific one, and the padding never applied at all — visible
only as checkboxes sitting 8px out of line.

Two lessons, and they generalise well past tables:

> **A design token is only as strong as the specificity of the rule carrying it.**

> **Fluid design needs measurement, because its failures are a few pixels wide
> and invisible in review.**

This is what `measure.mjs` is for. Drift, overlap, silent wrapping and inert
truncation are all *rendered* faults. No amount of stylesheet analysis finds
them. Measure at every width where a structural step happens, plus both anchors.

---

## Every breakpoint must answer a question out loud

Breakpoints are not banned — unmotivated ones are. The test is whether you can
say what question the breakpoint answers, in plain words, without referring to
pixels:

| Width | The question it answers |
|---|---|
| 700px | Is there room for a sentence of description? |
| 900px | Is there room for a sidebar? |
| 1200px | Is there room for a second column beside the main one? |

> **If a breakpoint can't answer a question in plain words, it shouldn't exist —
> that's a value that should have been a `clamp()`.**

The corollary bites harder than it looks: **two breakpoints that answer different
questions must not share a width just because they currently coincide.** Tying
"room for a sidebar" to "room for a sentence" at the same 900px left a name
column absorbing 400px of dead space at 899px. Splitting them to 900 and 700
fixed it. They were never the same question.

Profiles keep a `structural.breakpoints` registry — width plus the question —
and `audit.mjs` errors on any query width missing from it.

---

## Write the DOM in phone order

On a phone, a dashboard's rail cards follow the main cards in one column. That
is also the order a screen reader and the tab key follow. On desktop, CSS moves
the rail into its own column **without reordering anything**.

> **Design the reading order for the phone; let the desktop rearrange it visually.**

This is free accessibility if you do it from the start and an expensive retrofit
if you don't. It also means proportional splits should be expressed as ratios,
not pixel pairs: a 692:420 desktop split written as `1.647 : 1` stays correct at
1300px and 1600px, where the pixel pair does not.

---

## Let the layout work out its own answer

The strongest fluid result is the one where you wrote no rule at all.

```css
grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
```

That says *fit as many 110px-or-wider tiles as you can*. It lands on 3 tiles at
390px, 4 around tablet and 5 at 1440px — matching both design frames without
either number appearing anywhere in the CSS. No breakpoint, no column count, no
decision to maintain.

Reach for this before reaching for a structural step. A structural step you
didn't have to declare is one that can never drift from the design.

---

## Read a mobile frame for intent, not for layer structure

A mobile table frame drawn as *two panels* — a fixed name panel and a scrolling
panel — is describing an experience, not a DOM. Building it literally gives you
two row lists that must stay in vertical lockstep forever, which is a permanent
bug source.

Build one table with a pinned first column instead. The frozen-panel look then
falls out as an *outcome*: at 1440px everything fits and nothing looks pinned;
below ~900px the columns stop fitting and the name column pins itself. Same
markup at every width.

> **Read a mobile frame for what it says the user should experience, not for how
> the layers happen to be stacked.**

---

## Deciding the bucket

When a new value shows up, ask in order:

1. **Is it an accessibility or perceptual floor?** → static.
2. **Is there a sensible value at every width between the anchors?** → scalar.
3. **Otherwise** → structural. Add it to the allowlist and name the steps.

Most disagreements are really step 2. "What is the sensible nav pattern at
830px?" has no answer, which is how you know navigation is structural.
