# Structural patterns

Recipes for the values that must step. Each one names the question its
breakpoint answers — if you can't state the question, it shouldn't be a
breakpoint.

---

## Navigation

| | Phone | Desktop |
|---|---|---|
| Main nav | floating pill tab bar, bottom | fixed sidebar, left |
| Everything else | hamburger → a real screen | sidebar section |

**Question the breakpoint answers:** *Is there room for a sidebar?* (~900px)

Two things people get wrong:

**The lists are not the same.** The phone tab bar holds the five things people
do daily. Some items get promoted into it; admin tooling gets demoted behind the
hamburger. This is a product decision — ask, don't derive it from the desktop
nav by truncation.

**A hamburger should navigate, not duplicate.** Pushing a real Settings screen
beats opening a drawer that reimplements the same content. A drawer that
duplicates a screen is two things to maintain and two places for them to drift.

---

## Tile grids — let the layout decide

```css
grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
```

No breakpoint, no column count. Lands on 3 tiles at 390px, 4 at tablet, 5 at
1440px — matching both frames without either number appearing in the CSS.

Reach for this before declaring a structural step. Pick the `minmax` floor from
the narrowest tile that still reads, not from a column count you want.

---

## Carousels and edge-to-edge breakout

One `clamp()` on the card width does the whole job:

- Phone: card is 328px, the next peeks ~46px, inviting a swipe.
- Desktop: card fills the column, so nothing peeks and it stops being a carousel.

Let the row run **edge to edge** on small screens, deliberately breaking past the
page margin. A card that stops at an invisible margin line looks *broken*; a card
running off the screen edge clearly means "there is more, scroll".

**Question the breakpoint answers:** *Is there a rail the carousel must not
overlap?* (~1200px) — above that, switch the breakout off.

---

## Dashboard rail

Rail sits beside the main column above ~1200px, and continues below it under
that. Write the HTML in **phone order** — rail cards after main cards, one column
— and let CSS move the rail on desktop without reordering. That order is also
what a screen reader and the tab key follow.

Express the split as a **ratio**, not a pixel pair: a 692:420 desktop split is
`1.647 : 1`, which stays correct at 1300px and 1600px too.

**Question the breakpoint answers:** *Is there room for a second column beside
the main one?*

---

## Mobile header composition

The commonest over-stuffed component. A desktop header carrying title, search,
filter and tabs will not fit one phone row. Options, roughly in order of
preference:

1. **Collapse into one sticky bar** — title shrinks, search becomes an icon,
   tabs scroll horizontally underneath.
2. **Promote one, demote the rest** — whichever the screen is actually for.
3. **Push filters into a sheet** behind a button showing the active count.

**Question the breakpoint answers:** *Should the page header, search and tabs
collapse into one sticky bar?* (~900px)

Tabs that scroll horizontally need a visible partial third tab, for the same
reason carousels peek: a cut-off item is the affordance.

---

## Pagination

Numbered pages need width. Below ~900px, "1 of 10" with a progress bar carries
the same information in a fraction of the space and is a bigger tap target.

**Question the breakpoint answers:** *Numbered pages, or "1 of 10"?*

---

## Disclosure

What collapses, in rough order of how safely it collapses:

| Content | Phone treatment |
|---|---|
| Secondary metadata | accordion, collapsed |
| Filters | bottom sheet behind a button with active count |
| Settings / admin | a real screen, not a drawer |
| Primary actions | **never collapse** — these earn their space |

---

## Prefer container queries for components

A card doesn't care how wide the *viewport* is, only how wide its own slot is.
A table's available width changes by 240px purely because a sidebar appeared —
a media query cannot see that; a container query can.

```css
.card { container-type: inline-size; }

@container (min-width: 400px) {
  .card { grid-template-columns: auto 1fr; }
}
```

Reserve media queries for page-level topology — *is there room for a sidebar* —
and use container queries for everything a component decides about itself. This
also makes components portable between layouts, which is the real prize.
