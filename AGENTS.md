# Fluid Responsive — agent instructions

Read this before changing any CSS, design tokens, or responsive layout in this
project. It is the same guidance the Claude skill in `SKILL.md` follows; this
file exists so Codex, Cursor and any other agent that reads `AGENTS.md` gets it
too.

---

## The one rule

Every value you write belongs to exactly one of three groups. Put it in the
right group and the correct implementation stops being a judgement call.

| Group | Plain English | Examples | How to write it |
|---|---|---|---|
| **Stretch** | grows smoothly with the window | font size, padding, gaps, page margin | `clamp()` — **never** a media query |
| **Switch** | flips between fixed states | column count, nav pattern, table layout | a media or container query — **this is what they're for** |
| **Frozen** | never changes, ever | tap targets, focus rings, button padding, radii | a plain number — **never** inside a `clamp()` |

The test for Switch: *is there a sensible value halfway between?* There is no
sensible answer between "sidebar" and "bottom tab bar", so navigation switches.
There is a sensible answer between 16px and 24px padding, so padding stretches.

---

## Build first, ask second

1. Run `node scripts/detect.mjs <dir>` — it reads existing tokens and recovers
   the anchors from the maths. Never ask what this already answered.
2. Put whatever design values exist into a `refs.json` (see `SKILL.md`). Don't
   ask for a design that doesn't exist.
3. `node scripts/init.mjs --refs refs.json --out .utopia`
4. `node scripts/generate.mjs --profile .utopia/profile.json --out tokens.css`
5. Validate (below). Fix the **profile**, never the generated CSS.

Ask a question only when it is a product decision no tool can derive (is the
mobile nav the same list as desktop?), a choice that reshapes the DOM (does the
table become cards?), or a genuine conflict between sources. Everything else
gets a sensible default plus one line saying what you assumed.

---

## Always validate

```bash
node scripts/sweep.mjs    tokens.css --profile <p>.json   # scale integrity
node scripts/contrast.mjs tokens.css --profile <p>.json   # WCAG at the MOBILE size
node scripts/audit.mjs    src/       --profile <p>.json   # rule violations
node scripts/measure.mjs  <url>      --profile <p>.json   # real browser (Playwright)
```

Report failures verbatim. All four exit non-zero, so they drop into CI.

---

## Never do these

- Hand-write a `clamp()`. Reference a token or regenerate.
- Put a tap target, focus ring, or button padding inside a `clamp()`.
- Use `height` on anything tappable — always `min-height`.
- Judge colour contrast by a token's desktop size. Use the **mobile** size.
- Set `line-height` in px or `letter-spacing` in px on fluid text.
- Wrap a `ch` measure in `clamp()` — `ch` is already fluid.
- Size a pinned table column as a percentage.
- Put `text-overflow: ellipsis` on a `<td>` or on inline text. It silently does
  nothing. Use a block-level wrapper inside the cell.
- Add a breakpoint you cannot justify in a plain sentence.
- Let two different questions share a breakpoint width by coincidence.
- Present a value you derived as though it came from a design.
- Edit generated CSS. Edit the profile and regenerate.

---

## Table rules (the hard part)

1. **Exactly one stretchy column, at every width.** If none absorbs the leftover
   space, the browser shares it across every column and your "fixed 44px" column
   renders at 52.8px. This is the single most common failure.
2. **A pinned column is an absolute size**, never a percentage.
3. **Truncate in one place**, on a block-level wrapper inside every cell and
   header. Needs all three of `overflow: hidden`, `white-space: nowrap`, and a
   block box.
4. **Columns leave in priority order**, kept as data, not scattered CSS.
5. **Don't hide columns in a table with a `colspan` row** — the columns stay
   alive and width goes to cells nobody can see.

Full reasoning in `references/tables.md`.

---

## Deeper reading

| File | When |
|---|---|
| `references/doctrine.md` | deciding Stretch vs Switch vs Frozen |
| `references/elicitation.md` | what to ask, and what to assume instead |
| `references/tables.md` | any data table |
| `references/structural-patterns.md` | nav, grids, carousels, headers, disclosure |
| `references/gotchas.md` | a check failed and you want the reasoning |
| `references/figma-bridge.md` | reading from or writing to Figma |
