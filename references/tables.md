# Tables — the hard part

Everything else in fluid design behaves. Data tables fight back, because a
column either exists or it doesn't: there is no 0.4 of a column. Tables are
where scalar, structural and static all collide in one component.

These four rules came out of shipping one real table from 1440px to 390px.

---

## Rule 1 — Exactly one column may be stretchy. Always.

The most surprising failure in fluid design.

CSS table layout lays out every column with a set width, then shares the
**leftover** space. If no column volunteers to absorb it, the engine spreads it
proportionally across *every* column — including the ones you fixed.

A `44px` checkbox column measured **52.8px at 768px**. The token said 44. The
browser said 52.8. Nothing in the CSS was wrong.

**Fix:** guarantee exactly one stretchy column at every width.

```css
/* above 700px, description absorbs the slack */
.col-description { width: auto; }

/* below 700px description is gone, so the name column takes over */
@media (max-width: 699px) {
  .col-item-name { width: auto; }
}
```

Exactly one, at every width. Zero stretchy columns causes drift on all of them.
Two stretchy columns makes the split unpredictable.

Cap the absorbing column. Left uncapped, the name column grew to 402px at 899px
— technically correct, visually broken. If the cap is being hit often, bring the
dropped column back earlier instead.

`measure.mjs`'s `fixedWidths` assertion is what catches this. It is the single
most valuable check in the repo, because the failure is a few pixels wide and
nobody spots it in review.

---

## Rule 2 — A pinned column can never be a percentage

`30%` of a 520px phone table is ~250px, leaving roughly 64px of actually
scrollable content. Useless.

A pinned column must be an **absolute** size, chosen so the pinned block matches
the panel width the design shows:

```css
.col-item-name {
  position: sticky;
  left: 0;
  width: clamp(8.5rem, 7.2rem + 3.4vw, 14.75rem);  /* 136px → 236px */
}
```

Still fluid, still a `clamp()` — just never a percentage. Percentages and pinned
columns don't mix, because the percentage is of a width that the pinning is
itself changing.

`audit.mjs` flags this as `pinned-percentage`.

---

## Rule 3 — Truncate in exactly one place, on a block-level wrapper

The requirement: as a column narrows, text shortens and gains a "…", never wraps
to two lines, never spills into its neighbour.

The catch: `text-overflow: ellipsis` **silently does nothing** in the two places
you would naturally put it — on inline text, and on a table cell itself.

```css
/* does nothing at all */
td { text-overflow: ellipsis; }

/* works */
td > .cell-text,
th > .cell-text {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
```

Every cell **and every header label** renders inside one wrapper with one shared
rule. "Assigned To" becomes "Assigned…" when its column narrows; the full text
stays available on hover and to assistive tech.

All three properties are required. `audit.mjs` checks for each independently as
`inert-ellipsis`, because missing any one produces the same silent no-op.

**Never truncate to two lines.** A uniform row height is worth more than a full
label in a table people scan.

---

## Rule 4 — Columns leave in priority order, and the order is data

Some things cannot be fluid. Rank columns by **decision value per pixel** — how
much a person needs this column to make a choice.

Description goes first: longest content, least load-bearing. Nobody decides
anything from a truncated half-sentence.

Keep the order as **data**, not as scattered CSS rules:

```json
"tableRules": {
  "dropOrder": ["description", "assignedTo", "units"],
  "minUsefulWidth": { "description": 80 }
}
```

A priority list is reviewable and testable. Show/hide rules spread across a
stylesheet are neither — and they are where specificity bugs breed. If a column
would render below its minimum useful width, drop it rather than show
"Powder-free…".

---

## Structural choice: scroll sideways, or become cards?

Below roughly 560px there are two honest answers:

| | Horizontal scroll | Rows become cards |
|---|---|---|
| Fidelity to a table frame | matches | departs |
| Scanning many rows | good | poor |
| Reading one row fully | poor | good |
| Implementation | one markup | two layouts |

Horizontal scroll works and preserves the table's job. Cards read better for a
single record. **This is a design decision, not a refactor** — decide it per
screen based on whether people scan or read, and record the answer in the
profile's `tableStrategy`.

When a pinned column overlaps content sliding underneath, add a shadow on its
edge **only while actually scrolled**, so the cue means "there is more" rather
than being permanent decoration.
