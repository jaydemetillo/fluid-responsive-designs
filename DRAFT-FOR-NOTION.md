# 🔧 Fluid Responsive: the tooling

Companion to [🌊 Fluid Responsive: Desktop → Mobile (Pulse)](https://app.notion.com/p/opengov/Fluid-Responsive-Desktop-Mobile-Pulse-3d077dbba788812b9c35ca76421a270d).
Repo: [github.com/jaydemetillo/fluid-responsive-designs](https://github.com/jaydemetillo/fluid-responsive-designs)

---

## What this is

The Pulse document wrote down the rules we had to invent to get two screens from
1440px to 390px. This is those rules turned into **software that checks them**.

A Claude skill plus four scripts. The skill builds first and asks second; the
scripts prove the result and exit non-zero in CI.

The Pulse doc ends on the line that motivated all of it:

> Fluid design needs measurement, because its failures are a few pixels wide and
> invisible in review.

Everything here follows from taking that seriously — including, as it turned
out, catching the same class of bug in our own build.

---

## The gap it fills

The Utopia ecosystem is five implementations of one calculation: given two
viewport anchors, interpolate type and space with `clamp()`.

**None of them asks a single question.** Not the calculators, not `utopia-core`,
not the SCSS port, not the PostCSS plugin, not the Tailwind plugin. That is
deliberate — Utopia's thesis is that once the anchors are fixed there is nothing
left to decide.

That thesis is true **for scalars**, and silent on everything else: what happens
to the navigation at 830px, whether a six-column table becomes a card list, what
the mobile header contains, whether a 44px tap target survives being clamped.

And none of them can tell you your fixed 44px column is rendering at 52.8px.

---

## The one idea underneath it

The Pulse doc had two buckets — things that flow, things that are frozen.
Working through the table pushed out a third, and it is where every unanswered
question lives.

| | **Scalar** | **Structural** | **Static** |
|---|---|---|---|
| Examples | font size, padding, gap, gutter, measure | column count, nav pattern, table strategy, disclosure | tap target, focus ring, button label, radii |
| Implementation | `clamp()` | media / container query | a plain number |
| Media query? | never | **yes — this is what they're for** | never |
| Inside a `clamp()`? | always | never | **never** |

The useful column is **structural**. Those values have no sensible in-between
state — there is no defensible answer at 830px between "sidebar" and "tab bar" —
so they must step, and a query is the right tool. Utopia says nothing about
them, which is why so many Utopia projects have a beautiful type scale and an
incoherent tablet layout.

This also settles the breakpoint argument. Breakpoints are not banned;
**unmotivated** ones are. The Pulse rule stands exactly as written:

> If a breakpoint can't answer a question in plain words, it shouldn't exist —
> that's a value that should have been a clamp.

Profiles now keep a registry of breakpoints with the question each answers, and
the audit errors on any query width missing from it.

---

## The four checks

| Script | Catches | Needs |
|---|---|---|
| `sweep` | scale integrity across 320–2560px | nothing |
| `contrast` | WCAG judged at the **mobile** anchor | nothing |
| `audit` | doctrine violations in the CSS | nothing |
| `measure` | **rendered drift on a live page** | Playwright |

### `contrast` — the 18px trap, mechanised

§3 of the Pulse doc calls this out. WCAG's "large text" threshold is a fixed
18px; our font sizes are not. Same grey, opposite verdicts:

```
element                       @min    ratio   needs
--font-subtitle-small         16px   3.23:1   4.5:1 ✗  ⟵ fluid trap
--font-subtitle-default       18px   3.23:1     3:1 ✓
```

Identical colour. One fails, one passes, purely because of where each token's
*minimum* sits relative to 18px. Invisible to eyeballs and to every colour tool
on the market, because those tools ask you for a size and you hand them the one
you designed at.

### `measure` — the 52.8px column

The only script needing a browser, and the most valuable. §5 Rule 1 of the Pulse
doc describes the bug: a fixed 44px checkbox column measured 52.8px at 768px,
because CSS table layout redistributes leftover space across every column unless
exactly one volunteers to absorb it.

Nothing in the CSS was wrong. The layout engine overruled the token. **No amount
of stylesheet analysis finds that.**

This answers Open Question 1 ("should zero drift fail the build?"). It is now a
script with an exit code, so it can finally be a test.

---

## We put it through three real scenarios

Not a demo — three actual builds, each run end to end through the skill, with
every token generated rather than hand-written.

| | Scenario | References |
|---|---|---|
| **S1** | Item Catalogue, desktop → mobile | one Figma frame |
| **S2** | Station Dashboard, mobile → desktop | one Figma frame |
| **S3** | A simple table | **none at all** |

All three pass `sweep`, `audit` and `measure`. Getting them there took four bug
fixes, and **three of the bugs were in our own build** — found by the tooling,
not by looking.

### The one that matters most

The pinned item-name column in S1 declared `170px` and rendered **195px at
759px, 229px at 899px**.

Six columns summing to 610px sat inside a 700px table. Nothing volunteered to
absorb the 90px of slack, so CSS table layout shared it across all six.

That is Rule 1 of the Pulse doc, violated in a build written by someone who had
just finished writing Rule 1 down. The screenshot looked completely fine. Only
the measurement caught it.

**If you take one thing from this page, take that.** Writing the rule down is
not the same as following it, and the only reliable difference is a script.

### The other three

**`flex-wrap: wrap` on a column container.** The expanded detail panel's photo
block rendered 104px tall around a 171px child, spilling over the description.
A column-direction flex container with `flex-wrap: wrap` wraps into *columns*,
stacking them. Flipping `flex-direction` in a media query without also flipping
`flex-wrap` is the trap.

**Hiding a column that a `colspan` row still spans.** `display: none` on four
`<th>` did not remove those columns, because the expanded row spans all six.
Width went to columns nobody could see, and the pinned column measured **418px
against a 170px token**. The fix was to stop hiding columns and let the table
scroll with the first pinned — which is what the mobile frame was describing
anyway. The frozen-panel look is an *outcome* of pinning, not a second layout.

**The Pulse desktop type scale is too tightly packed for mobile.** Five type
roles live inside 11–16px. Compressed to a 390px anchor they collapse onto each
other. The tool refused to fudge it and printed a decision block with four
options; we took "differentiate by weight", which the design already does.

---

## Three findings for the team

**1. Pulse's two titles collide at desktop.** From §2 of the Pulse doc:

| | 390px | 1440px |
|---|---|---|
| Screen title | 20px | **32px** |
| Page title | 24px | **32px** |

On a 1440px screen "Sengkang General Hospital" and "Good morning, Aisha" render
at the same size, so the hierarchy that exists on the phone disappears on the
desktop — the opposite of what you would expect. Separate them by size, or
accept the collision and differentiate by weight.

**2. The type scale has no room underneath it.** Because body sits at the
readability floor, a smaller "caption" role has nowhere to go. Worth deciding
whether Pulse wants a caption role at all, or whether small text should be
handled by weight and colour.

**3. Card padding and small print are off the 4pt grid.** 14px card padding and
10px small print. Recorded in the profile as a 2pt grid rather than silently
rounded, but it is a real deviation worth a decision.

---

## The questions it asks

The point of the skill is that it interrogates before generating — but sparingly.

**Detect, don't ask.** It reads the codebase first and recovers the anchors
*from the clamp maths itself*. Everything found becomes a proposed default, so
the common path is confirmation rather than data entry.

**Build, then ask what building revealed.** The bar for a question is high: a
product decision no tool can derive, a choice that reshapes the DOM, or a real
conflict between sources. Everything else gets a sensible default and a one-line
note saying what was assumed — cheaper to correct than a question is to answer.

The question most often skipped and most worth asking is from §4 of the Pulse
doc: **is the mobile nav the same list as desktop?** Usually not — Withdraw gets
promoted into the tab bar, Guide and admin tools get demoted. That is a content
decision, and no tool can derive it.

---

## Reference counts

Two independent axes, because these get conflated. Where the design comes from
(nothing / Figma / existing code), and **how many anchors actually exist**:

- **Both frames** — read both, invent nothing. This is why Pulse's design and
  build cannot drift at the two widths anyone reviews.
- **One frame** — derive the other end, and *say which numbers are derived*. A
  derived anchor is a proposal, not a measurement. Presenting it as one throws
  away the method's guarantee.
- **None** — you still get working, validated tokens with zero input.

All three are proven end to end in the test suite, not just claimed.

---

## What it doesn't do

- Specificity bugs (§7 #4 in the Pulse doc) have **no static check**. They are
  only caught by `measure` noticing the consequence. That is an argument for
  measuring, not a gap that can be closed by reading CSS.
- No colour values ship in the repo, so contrast checking stays off until
  someone supplies a palette.
- It does not decide `tableStrategy` for you. Scroll-sideways vs cards is a
  design call about whether people scan or read.

---

## Open questions this turns into decisions

From §8 of the Pulse doc — now testable rather than debatable:

1. **Should zero drift fail the build?** `measure` exits non-zero. Wiring it
   into CI is a one-line decision.
2. **Do we adopt 390/1440 as the standard Pulse anchor pair?** If yes, the pulse
   profile becomes the shared one and every screen inherits one scale.
3. **Column drop order as data rather than CSS rules?** Already modelled as data
   in the profile — it needs the actual order filled in.
4. **Container queries?** The doc calls this the biggest improvement available,
   and it is now the recommended default for anything a *component* decides
   about itself, with media queries reserved for page-level topology.

Still genuinely undecided, and needing design rather than engineering: whether
table rows become cards below ~560px, and whether column headers get authored
short forms instead of truncating.

---

## Try it

```bash
git clone https://github.com/jaydemetillo/fluid-responsive-designs.git
cd fluid-responsive-designs
node test/run.mjs                                    # 15 proofs, no install
python3 -m http.server 4178 --directory examples     # the three scenarios
```

Every proof asserts that a specific validator catches the specific bug it exists
to catch. A validator nobody has watched fail is a validator you cannot trust.
