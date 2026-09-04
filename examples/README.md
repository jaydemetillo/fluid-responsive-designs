# Worked examples

Three scenarios, each run end to end through the skill and validated with all
four checks. Serve them with:

```bash
python3 -m http.server 4178 --directory examples
```

| | Scenario | References | Path |
|---|---|---|---|
| **S1** | Item Catalogue, desktop → mobile | one Figma frame (desktop) + page margin read from the sibling mobile frame | `/s1-desktop-to-mobile/` |
| **S2** | Station Dashboard, mobile → desktop | one Figma frame (mobile) | `/s2-mobile-to-desktop/` |
| **S3** | Equipment checks table | **none** — pure `profiles/default.json` | `/s3-simple-table/` |

Each folder holds its `refs.json`, the generated `.utopia/profile.json` and
`tokens.css`, and an `index.html` that references tokens only — no raw px, no
hand-written `clamp()`.

## What the run found

**S1 — the Pulse desktop scale is too tightly packed for mobile.** Five type
roles live inside 11–16px. Compressed to a 390px anchor they collapse onto each
other, and `init.mjs` refused to fudge it — it printed DECISIONS NEEDED with
four options. Resolved by dropping to three genuine roles and differentiating
the rest by weight, which is what the design already does.

**S1 — column drift, reproduced in our own build.** The pinned item-name column
declared 170px and measured 195px at 759px and 229px at 899px. Cause: the six
declared columns sum to 610px inside a 700px table, and with no column
volunteering to absorb the 90px slack, CSS table layout shared it across all
six. Exactly the 44px → 52.8px failure from the Pulse write-up. Fixed by
declaring `.c-stock { width: auto }` — Rule 1, exactly one stretchy column.

**S1 — `flex-wrap: wrap` on a column container.** The expanded panel's photo
block rendered 104px tall around a 171px child, spilling over the description.
A column-direction flex container with `flex-wrap: wrap` wraps into *columns*,
stacking them. Row direction needs the wrap; column direction must not have it.

**S1 — hiding columns breaks a colspan row.** `display: none` on four `<th>`
still left six columns alive, because the expanded detail row spans all six.
The pinned column then measured 418px against a 170px token. Keeping every
column and scrolling is both simpler and what the frame was describing: the
frozen-panel look is an *outcome* of pinning, not a separate layout.

**S2 — a role the design never had.** The mobile frame declares one title size,
so the tool invented a second from the base profile; the two crossed over at
918px. `sweep.mjs` caught the inversion. Fixed with `dropUnreferencedType` — a
design that uses three type roles does not need five.

## Verification

```
s1-desktop-to-mobile       sweep:OK   audit:OK   measure:OK
s2-mobile-to-desktop       sweep:OK   audit:OK   measure:OK
s3-simple-table            sweep:OK   audit:OK   measure:OK
```

`measure` runs a real browser across eight widths per scenario and asserts zero
drift, no overlap, no wrapping, no untruncated overflow, and no sideways page
scroll.
