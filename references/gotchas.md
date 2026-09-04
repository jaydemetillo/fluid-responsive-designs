# Gotchas

Every one of these has shipped. Each maps to a validator rule, so read the
reasoning here when a check fires and you're deciding whether to override it.

---

## 1. The 18px contrast trap · `contrast.mjs`

WCAG's "large text" threshold (18px, or 14px bold) is a **fixed** number. Your
font sizes are not. A token running 16→18px earns the relaxed 3:1 allowance at
1440px and does not earn it at 390px.

Judge it at desktop and you ship text failing 4.5:1 at every width below the top
anchor — which is most widths, on most devices.

**Rule:** test contrast against the token's value at the **minimum** anchor.
Only tokens whose minimum is already ≥18px may use 3:1.

Invisible to eyeballs and to every colour tool on the market, because those tools
ask you for a size and you naturally hand them the one you designed at.

---

## 2. A clamped tap target · `audit.mjs → clamped-floor`

```css
min-height: clamp(2rem, 1.5rem + 1vw, 2.75rem);   /* 44px only at 1440px */
```

Reads 44px at the top anchor and less at every width below it — failing silently
at exactly the widths where fingers are. Same for focus rings: a 2px ring that
interpolates to 1px on mobile is a 1px ring where contrast is already worst.

**Rule:** `min-height: var(--tap-target-min)`, and let fluid padding grow it.
Never `height` — that lets padding shrink it.

---

## 3. Column drift · `measure.mjs → drift`

A fixed 44px column measured 52.8px at 768px. CSS table layout shares leftover
space across every column unless exactly one volunteers to absorb it.

**Rule:** guarantee exactly one stretchy column at every width. See
`references/tables.md` Rule 1.

Only a live measurement finds this. No stylesheet analysis can.

---

## 4. Truncation that silently does nothing · `audit.mjs → inert-ellipsis`

`text-overflow: ellipsis` needs **all three** of `overflow: hidden`,
`white-space: nowrap`, and a block-level box. It does nothing on inline text and
nothing on a table cell itself — the text just spills into its neighbour.

**Rule:** render every cell and header label inside one block-level wrapper and
put the rule there, once.

---

## 5. Specificity beats your tokens · no automated check

A more general rule elsewhere in the stylesheet outranked a column-specific one,
so the padding never applied. The only visible symptom was checkboxes sitting
8px out of line with the header.

> **A design token is only as strong as the specificity of the rule carrying it.**

**Rule:** scope overrides deliberately, and put show/hide rules last. This one
has no lint — it is caught by `measure.mjs` noticing the *consequence*, which is
the argument for measuring rather than reading.

---

## 6. Percentage width on a pinned column · `audit.mjs → pinned-percentage`

30% of a 520px phone table is ~250px, leaving ~64px to actually scroll. The
percentage is of a width the pinning is itself changing.

**Rule:** pinned columns take absolute sizes. Still fluid via `clamp()`, never
a percentage.

---

## 7. Two breakpoints sharing a width by accident · `audit.mjs → unregistered-breakpoint`

"Room for a sidebar" and "room for a sentence of description" are different
questions that happened to both sit at 900px. Tied together, the name column
absorbed 400px of dead space at 899px. Split to 900 and 700, it was fine.

**Rule:** every breakpoint carries the question it answers. Two questions never
share a width unless they are genuinely the same question.

---

## 8. Bare `vw` font sizes · `audit.mjs → bare-vw`

```css
font-size: 5vw;   /* ignores the user's font-size setting entirely */
```

Breaks browser font-size preferences and 200% zoom — WCAG 1.4.4.

**Rule:** always `clamp()` with a rem-based preferred value.

---

## 9. px line-height or letter-spacing on fluid text · `audit.mjs → px-leading`, `px-tracking`

A px line-height desynchronises from a font size that moves, and clips
descenders at one end of the range.

**Rule:** unitless line-height, `em` letter-spacing. Always.

---

## 10. `clamp()` around a `ch` measure · `audit.mjs → clamped-ch`

`ch` is already relative to the font size, so `max-width: 75ch` is fluid for
free. Wrapping it in `clamp()` nests two independent fluid systems and the
result is unpredictable.

**Rule:** `max-width: 75ch`, bare.

---

## 11. Two roles that render the same size · `sweep.mjs → separation`

A title band only 28–32px wide cannot hold two distinct fluid steps: both roles
land on 28px at mobile and separate only at desktop. Two roles that render
identically are not two roles.

**Rule:** differentiate by weight at the collapsed end, or widen the band. Widening
a band is a design-system amendment, not a per-screen decision.

---

## 12. Building a mobile frame literally · no automated check

A frame drawn as two panels is describing an experience, not a DOM. Built
literally you get two row lists that must stay in vertical lockstep forever.

**Rule:** read a frame for what it says the user should experience. One table
with a pinned column produces the same look as an outcome, with one markup at
every width.
