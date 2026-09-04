# Elicitation — the questions Utopia doesn't ask

Utopia's tooling asks nothing, because its thesis is that once the anchors are
fixed there is nothing left to decide. True for scalars. Everything below is
what that leaves open.

**The rule that keeps this from becoming a form: never ask what you can read.**
Run `detect.mjs` first and turn every finding into a *proposed default*. The
common path should be confirmation, not data entry.

---

## Tier 0 — detect, don't ask

```bash
node scripts/detect.mjs <project-dir>
```

Answers without asking: existing anchors (recovered from the `clamp()` maths),
token ladder, static floors already declared, breakpoints in use, and whether
the codebase has tables, pinned columns, truncation, navigation, auto-fit grids
or container queries.

Summarise it in one short paragraph, then ask only what remains.

---

## Tier 1 — project config

Written once to `.utopia/responsive.json`. Ask at most 4 at a time, each with a
detected default.

### Anchors

| Question | Default | Why it matters |
|---|---|---|
| Which two viewport widths are the anchors? | detected, else 390 / 1440 | These are the only widths anyone designs or reviews |
| Device floor: 320 or 390? | 320 | 390 leaves iPhone SE and small Androids below the min bound, rendering flat |
| Do both design frames exist? | detect from Figma | **If both exist, read the numbers — never invent them.** Only derive when one is missing |

### Structure

| Question | Default |
|---|---|
| Column counts, and at what widths do they step? | 4 / 8 / 12 at 0 / 768 / 1200 |
| Desktop nav pattern → mobile nav pattern? | sidebar → bottom tab bar, or inline → hamburger |
| **Is the mobile nav the same list as desktop?** | no — see below |
| Table strategy below ~560px: scroll sideways or cards? | scroll (matches most frames); cards read better |
| What is the column drop order? | longest, least decision-critical first |
| Does anything need to break out edge-to-edge? | carousels yes, above the rail breakpoint no |

The nav question is the one people skip and shouldn't. A phone tab bar is
usually **not** the desktop list minus items — some things get *promoted*
(a daily task moves into the five tabs) and others *demoted* (admin tooling
moves behind a hamburger). That is a content decision, not a layout one, and it
needs a product answer rather than a CSS one.

### Accessibility

| Question | Default |
|---|---|
| Tap / click floors | 44px / 24px, static |
| Focus ring | 2px solid, 2px offset, static |
| Minimum readable size at the min anchor | 12px advisory (warn, don't block) |
| Are button labels static? | yes — shrinking a button's words makes it unusable |
| Contrast target | WCAG AA, judged at the **min** anchor |

### Output

| Question | Default |
|---|---|
| Format | plain CSS custom properties |
| Token prefix | none |
| Figma variable mode names | `Mobile` / `Desktop` |
| Should drift fail the build, or warn? | **fail** — drift is invisible in review |

---

## Tier 2 — per artefact

At generation time, at most 3 questions, and only for ambiguity detection could
not resolve. **Never re-ask Tier 1 here.** Re-interrogating someone's breakpoint
philosophy on every run is the fastest way to get a skill abandoned.

Good Tier 2 questions:

- "This table has 7 columns. Drop order — description first, then assigned-to?"
- "Mobile header: title + search + filter + tabs is 4 rows on a phone. Collapse
  search into an icon, or make the tabs scroll?"
- "This card's title truncates at 390px. Truncate, or allow two lines here?"

Bad Tier 2 questions — all already answered in Tier 1 or by detection:

- "What are your anchors?"
- "Do you want accessible text?"
- "Should this be responsive?"

---

## Direction-specific questions

The two directions are **not** mirror images.

### desktop → mobile — what collapses

1. Which nav items survive into the tab bar, and which get promoted/demoted?
2. What does the mobile header contain — title, search, filter, tabs? If the
   desktop has all four, they will not fit in one row.
3. Which table columns drop, in what order?
4. What truncates, and what must never truncate? (A product name is how someone
   identifies a row.)
5. Does the sidebar become a bottom bar, a drawer, or a real screen?

### mobile → desktop — what expands

1. What is the measure cap? Body text at 45ch stretched to 1440px is the
   characteristic mobile-first failure — a thin column of text in an ocean.
2. What fills the new horizontal space: a rail, a second column, or nothing?
3. What was hidden behind disclosure on mobile that should now be visible?
4. What was a full screen (a Settings page) that should become an inline panel?
5. Does the container need a max-width, and does content centre inside it?

Question 1 is the one people miss. Widening a mobile design is not "the same
design, bigger" — it is deciding what earns the space.

---

## When only one frame exists

You must derive the other anchor rather than read it. Say so explicitly, and
propose rather than assume:

> "There's only a desktop frame, so I'll derive the 390px end. Proposal: body
> 14px → 16px, page margin 16px → 80px, title 24px → 32px. These are proposals,
> not measurements — worth a designer's eye before they become tokens."

Never present a derived anchor as though it came from a design. The whole value
of the two-anchor method is that both ends are real; one derived end is a
reasonable estimate and should be labelled as one.
