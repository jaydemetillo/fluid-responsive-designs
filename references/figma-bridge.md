# Figma bridge

Figma cannot express `clamp()`. It can express the two ends, and that turns out
to be enough — because the two ends are the only thing anyone designs.

---

## Variable modes are the whole mechanism

One collection, two modes:

| Collection | Mode `Mobile` | Mode `Desktop` |
|---|---|---|
| `--space-m` | 16 | 24 |
| `--font-body-default` | 12 | 14 |
| `--space-page-margin` | 16 | 80 |

Switching the frame's mode switches the entire scale coherently. That is the
Figma equivalent of moving along the clamp.

**Annotate values with the token name, never the pixel number.** A frame that
says "24px" invites a developer to hardcode 24px, which loses the fluidity and
silently pins the mobile end to the desktop value. A frame that says
`--space-m` cannot be misread.

---

## Design at exactly two widths

Desktop **1440px** and mobile **390px** (or 320px if the device floor is 320).
Both frames fully snapped to the 4pt grid.

**Never mock an intermediate width.** There is nothing to decide at 900px — the
maths already answered it, and a hand-drawn 900px frame will disagree with what
the browser produces. If you need to show stakeholders the middle, screenshot
the running build rather than drawing it.

---

## Reading a design out of Figma (design → tokens)

When both frames exist, this is the good case: **read both, invent nothing.**

1. `get_variable_defs` on each frame to pull the real values.
2. Pair them per role: mobile value → `pair[0]`, desktop → `pair[1]`.
3. Write the pairs into a profile's `type.scale` / `space.scale`.
4. `node scripts/generate.mjs --profile <p>.json --out tokens.css`
5. `node scripts/sweep.mjs tokens.css --profile <p>.json`

Because both ends are real design values, design and build cannot drift apart at
the two widths anyone reviews. That property is the entire point, and it is lost
the moment you invent one end.

Step 5 is not optional. Real frames routinely contain collisions — two roles
that happen to land on the same size at one anchor — that nobody notices until
a script says so.

### When only one frame exists

Derive the missing end, and **label it as derived**. Say plainly which numbers
came from a design and which you proposed, and get a designer's eye on the
proposals before they become tokens. A derived anchor is a reasonable estimate,
not a measurement, and presenting it as one throws away the method's guarantee.

---

## Pushing tokens into Figma (tokens → design)

1. Create one variable collection with `Mobile` and `Desktop` modes.
2. For each token, set the mode values from the profile's `pair`.
3. Bind them to text styles and auto-layout padding/gap — never type raw numbers.
4. Static floors (44px tap, 2px focus ring, button padding) get **one** value in
   both modes. If they differ per mode, they are in the wrong bucket.

That last check is a useful audit in itself: anything whose Mobile and Desktop
values are equal is either static, or a scalar you forgot to make fluid.

---

## What Figma can't tell you

Variable modes carry scalars. They do not carry structure, so these still need
asking (see `references/elicitation.md`):

- Whether the mobile nav is the same list as desktop
- Column drop order in a table
- What truncates and what must never truncate
- Which breakpoints exist and what question each answers
- Whether the mobile frame's layer structure describes a DOM or just a look

The last one matters most. A table drawn as two panels is describing an
experience. Build it as one table with a pinned column and the panel look falls
out on its own — see `references/tables.md`.
