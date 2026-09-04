# 🔧 Fluid Responsive: the tooling

**Draft — for review before publishing to Notion.**
Companion to [🌊 Fluid Responsive: Desktop → Mobile (Pulse)](https://app.notion.com/p/opengov/Fluid-Responsive-Desktop-Mobile-Pulse-3d077dbba788812b9c35ca76421a270d).
Repo: [github.com/jaydemetillo/fluid-responsive-designs](https://github.com/jaydemetillo/fluid-responsive-designs)

---

## What this is

The Pulse document wrote down the rules we had to invent to get two screens from
1440px to 390px. This is those rules turned into **software that checks them**.

It is a Claude skill plus a small toolkit. The skill asks the structural
questions before generating anything; the toolkit proves the result with four
scripts that exit non-zero in CI.

The Pulse doc ends with the line that motivated all of this:

> Fluid design needs measurement, because its failures are a few pixels wide and
> invisible in review.

Everything here follows from taking that seriously.

---

## The gap it fills

The Utopia ecosystem is five implementations of one calculation: given two
viewport anchors, interpolate type and space with `clamp()`.

**None of them asks a single question.** Not the website calculators, not
`utopia-core`, not the SCSS port, not the PostCSS plugin, not the Tailwind
plugin. That is deliberate — Utopia's thesis is that once the anchors are fixed,
there is nothing left to decide.

That thesis is true **for scalars**, and silent on everything else:

- What happens to the navigation at 830px?
- Does a six-column table become a card list, or scroll sideways?
- What does the mobile header contain when desktop has title + search + filter + tabs?
- Does a 44px tap target survive being clamped? (No.)
- Is the mobile nav even the same list as desktop? (Usually not.)

And none of them can tell you your fixed 44px column is rendering at 52.8px.

---

## The one idea underneath it

Everything derives from a three-way split. The Pulse doc had two buckets —
things that flow, things that are frozen. Working through the table pushed out a
third, and it's where every unanswered question lives.

| | **Scalar** | **Structural** | **Static** |
|---|---|---|---|
| Examples | font size, padding, gap, gutter, measure | column count, nav pattern, table strategy, disclosure | tap target, focus ring, button label, radii |
| Implementation | `clamp()` | media / container query | a plain number |
| Media query? | never | **yes — this is what they're for** | never |
| Inside a `clamp()`? | always | never | **never** |

The useful part is the **structural** column. Those values have no sensible
in-between state — there is no defensible answer at 830px between "sidebar" and
"tab bar" — so they must step, and a query is the correct tool. Utopia has
nothing to say about them, which is why so many Utopia projects have a beautiful
type scale and an incoherent tablet layout.

This also settles the breakpoint argument. Breakpoints aren't banned;
**unmotivated** ones are. The Pulse rule stands as written:

> If a breakpoint can't answer a question in plain words, it shouldn't exist —
> that's a value that should have been a clamp.

The profile now keeps a registry of breakpoints with the question each answers,
and the audit errors on any query width that isn't in it.

---

## The four checks

| Script | Catches | Needs |
|---|---|---|
| `sweep` | scale integrity across 320–2560px | nothing |
| `contrast` | WCAG judged at the **mobile** anchor | nothing |
| `audit` | doctrine violations in the CSS | nothing |
| `measure` | **rendered drift on a live page** | Playwright |

### `contrast` — the 18px trap, mechanised

The Pulse doc calls this out in §3. WCAG's "large text" threshold is a fixed
18px; our font sizes are not. A token running 16→18px earns the relaxed 3:1
allowance at desktop and does not earn it at mobile.

Here is the check on a rigged fixture. Same grey, opposite verdicts:

```
element                       @min    ratio   needs
--font-subtitle-small         16px   3.23:1   4.5:1 ✗  ⟵ fluid trap
--font-subtitle-default       18px   3.23:1     3:1 ✓
```

Identical colour. One fails, one passes, purely because of where each token's
*minimum* sits relative to 18px. This failure is invisible to eyeballs and to
every colour tool on the market, because those tools ask you for a size and you
naturally hand them the one you designed at.

### `measure` — the 52.8px column

The most valuable script, and the only one needing a browser. §5 Rule 1 of the
Pulse doc describes the bug: a fixed 44px checkbox column measured 52.8px at
768px, because CSS table layout redistributes leftover space across every column
unless exactly one volunteers to absorb it.

Nothing in the CSS was wrong. The layout engine overruled the token. **No amount
of stylesheet analysis finds that** — you have to measure the rendered page, at
every width where something structural happens.

This directly answers Open Question 1 in the Pulse doc ("should zero drift fail
the build, or stay a guideline?"). It's now a script with an exit code, so it can
be either — but it can finally be a test.

---

## Two real findings, already

The checks found genuine collisions in **both** of our existing scales, without
being told to look.

**1. The e-commerce design system.** `Title/Small` and `Title/Default` both
render 28px at 390px and only separate at desktop (30 vs 32). Two roles that
render identically are not two roles. This was documented by hand in a comment;
it's now a failing test.

**2. Pulse itself.** From the numbers in §2 of the Pulse doc:

| | 390px | 1440px |
|---|---|---|
| Screen title | 20px | **32px** |
| Page title | 24px | **32px** |

They collide at the desktop anchor. On a 1440px screen, "Sengkang General
Hospital" and "Good morning, Aisha" are the same size — so the hierarchy that
exists on the phone disappears on the desktop, which is the opposite of what you
would expect.

Worth a design decision: separate them by size, or accept the collision and
differentiate by weight.

---

## The questions it asks

The point of the skill is that it interrogates before generating. Two tiers,
because mixing them is how these things get abandoned.

**Tier 0 — detect, don't ask.** It reads the codebase first and recovers the
anchors *from the clamp maths itself* — an existing token file tells you its own
anchors. Everything found becomes a proposed default, so the common path is
confirmation, not data entry.

**Tier 1 — project config**, asked once and written to a file: anchors and device
floor, column steps, nav pattern, table strategy and drop order, accessibility
floors, output format.

**Tier 2 — per screen**, at most three questions, only for genuine ambiguity.
Never re-asks Tier 1.

The question most often skipped and most worth asking is from §4 of the Pulse
doc: **is the mobile nav the same list as desktop?** Usually not — Withdraw gets
promoted into the tab bar, Guide and admin tools get demoted. That is a content
decision, not a layout one, and no tool can derive it.

---

## The scenarios it covers

Two independent axes, because these get conflated:

**Where the design comes from:** nothing (greenfield) · a Figma design via MCP ·
existing code.

**How many anchors actually exist:**

- **Both frames exist** — read both, invent nothing. This is the good case, and
  it's why Pulse's design and build can't drift at the two widths anyone reviews.
- **Only one frame** — derive the other end, and *say explicitly which numbers
  are derived*. A derived anchor is a proposal, not a measurement. Presenting it
  as one throws away the whole guarantee of the method.

Crossed with direction — desktop→mobile and mobile→desktop. Those are **not**
mirror images. The characteristic mobile-first failure isn't small text, it's a
45ch column stretched across 1440px with nothing beside it. Different bug,
different questions.

---

## What it doesn't do

Being straight about the edges:

- `measure.mjs` needs real selectors from a real DOM. The Pulse profile ships
  **placeholder selectors** — a green run against those proves nothing until
  someone fills in the actual ones.
- No colour values are in the repo. The e-commerce system forbids hardcoded hex,
  so contrast checking stays off until someone supplies a palette.
- Specificity bugs (§7 #4 in the Pulse doc — a general rule outranking a
  column-specific one) have **no static check**. They're only caught by `measure`
  noticing the consequence. That's an argument for measuring, not a gap that can
  be closed by reading CSS.
- It does not decide `tableStrategy` for you. Scroll-sideways vs cards is a
  design call about whether people scan or read.

---

## Open questions this turns into decisions

From §8 of the Pulse doc — these are now testable rather than debatable:

1. **Should zero drift fail the build?** `measure.mjs` exits non-zero. Wiring it
   into CI is a one-line decision.
2. **Do we adopt 390/1440 as the standard Pulse anchor pair?** If yes,
   `profiles/pulse.json` becomes the shared profile for all Pulse work and every
   screen inherits one scale.
3. **Column drop order as data rather than CSS rules?** Already modelled as data
   in the profile — it needs the actual order filled in.
4. **Container queries?** The doc calls this the single biggest improvement
   available, and it's now the recommended default for anything a *component*
   decides about itself, with media queries reserved for page-level topology.

Still genuinely undecided, and needing design rather than engineering: whether
table rows become cards below ~560px, and whether column headers get authored
short forms instead of truncating.

---

## Try it

```bash
git clone https://github.com/jaydemetillo/fluid-responsive-designs.git
cd fluid-responsive-designs
node test/run.mjs
```

Eight proofs, no install. Each one asserts that a specific validator catches the
specific bug it exists to catch — a validator nobody has watched fail is a
validator you can't trust.
