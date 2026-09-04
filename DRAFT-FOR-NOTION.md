# 🔧 Fluid Responsive: the toolkit

> **Published:** https://app.notion.com/p/3d177dbba78881ae9e09dad971b57d5c
> Edit this file, then re-publish, so the repo stays the source of truth.

Companion to [🌊 Fluid Responsive: Desktop → Mobile (Pulse)](https://app.notion.com/p/opengov/Fluid-Responsive-Desktop-Mobile-Pulse-3d077dbba788812b9c35ca76421a270d) · Code: [github.com/jaydemetillo/fluid-responsive-designs](https://github.com/jaydemetillo/fluid-responsive-designs)

---

## In one paragraph

The Pulse doc wrote down the rules we had to invent to get two screens from a
1440px desktop to a 390px phone. This turns those rules into a tool you can
point at any screen. It plugs into Claude Code, Codex and Cursor, builds the
sizes for you, and then **checks its own work** — including catching mistakes
that look completely fine on screen.

We tested it on three real screens. It found four bugs. Three of them were in
the code we'd just written using our own rules.

---

## The problem, in plain words

Normally responsive design works like clothing sizes. You design a Small and a
Large, and at some exact screen width the page *snaps* from one to the other.
Everything in between is a compromise nobody looked at.

The better approach — the one the Pulse doc describes — is to design **two
screens only** (a phone and a desktop) and let the browser work out every width
in between, smoothly. No snapping.

There are good open-source tools for the maths part. **But none of them ask you
a single question**, and none of them can tell you when the result is broken.

They'll happily interpolate your text sizes and say nothing about:

- What happens to the navigation halfway between phone and desktop?
- Does a six-column table become a card list, or scroll sideways?
- What goes in the mobile header when the desktop has a title, search, filters *and* tabs?
- Is the mobile menu even the same list as the desktop one?
- Did that button just shrink below the size a thumb can hit?

Those are real decisions somebody has to make on every screen. Right now they
get made in the moment and forgotten. This toolkit asks about them, records the
answer, and doesn't ask again.

---

## The one idea worth remembering

Every measurement in a design belongs to **one of three groups**. Once you know
which, there's no argument about how to build it.

| | **Stretch** | **Switch** | **Frozen** |
|---|---|---|---|
| What it does | grows smoothly with the window | flips between fixed states | never changes, ever |
| Examples | text size, padding, gaps, page margins | number of columns, sidebar vs bottom bar, table vs cards | tap targets, focus outlines, button padding, corner radius |
| The trap | adding a breakpoint it didn't need | pretending it can be smooth | letting it shrink on small screens |

**How to tell them apart — one question:** *is there a sensible value halfway
between?*

There's no sensible answer halfway between "sidebar" and "bottom tab bar" — so
navigation **switches**. There absolutely is a sensible answer between 16px and
24px padding — so padding **stretches**. And a tap target doesn't get an
opinion; 44px is 44px on every screen, so it's **frozen**.

The Pulse doc already had two of these groups ("things that flow" and "things
that are frozen"). Working through the table pushed out the third — and Switch
turns out to be where every unanswered question was hiding.

### This also settles the breakpoint argument

Breakpoints aren't banned. **Unjustified** ones are. The Pulse rule stands
exactly as written:

> If a breakpoint can't answer a question in plain words, it shouldn't exist.

So every breakpoint now has to carry its question, written down:

| Width | The question it answers |
|---|---|
| 700px | Is there room for a sentence of description? |
| 900px | Is there room for a sidebar? |
| 1200px | Is there room for a second column beside the main one? |

The tool refuses any breakpoint that isn't on that list. It's a small thing that
stops a stylesheet quietly accumulating a dozen magic numbers.

---

## Four ways this quietly breaks

Every one of these has actually happened. None of them look wrong on screen.

### 1. The button that's too small to press

You want a button to feel proportional, so you let its height grow with the
window. It reads 44px on your laptop. Ship it, and on a phone it's 31px — too
small for a thumb, on the exact device where thumbs are the only input.

It passes every visual review because reviews happen on laptops.

> **The rule:** anything you tap has a floor it can never go under. Let padding
> make it *bigger*, never smaller.

### 2. Text that fails contrast only on phones

Accessibility guidance says small text needs stronger colour contrast than large
text, and draws the line at 18px.

But our text sizes now *change*. A heading that's 16px on a phone and 18px on
desktop sits on **both sides of that line**. Check it on your desktop mockup and
it passes. On a phone it fails — and that's most of your users.

Here's the same grey, on two different text styles:

```
                              phone size   contrast   needs
subtitle (small)                    16px    3.23:1    4.5:1   ✗ fails
subtitle (default)                  18px    3.23:1      3:1   ✓ passes
```

Identical colour. Opposite verdicts. The only difference is which side of 18px
the *phone* size lands on.

> **The rule:** always check contrast against the phone size, never the desktop
> size.

This one is genuinely invisible — no colour tool on the market catches it,
because they all ask you for a size and you naturally give them the one you
designed at.

### 3. The column that ignores what you told it

This is the one from §5 of the Pulse doc, and it's the reason the toolkit needs
to open a real browser.

You set a checkbox column to exactly 44px. It renders at 52.8px.

Nothing in the code is wrong. Tables have a rule: after all the fixed-width
columns are placed, leftover space gets shared out. If no column volunteers to
soak it up, it's spread across **every** column — including the ones you fixed.

> **The rule:** exactly one column must be stretchy at every width. Then it
> absorbs the slack and everything else lands on its exact number.

You cannot find this by reading the code. The code is correct. Only measuring
the actual page finds it.

### 4. The "…" that does nothing

You want long text to shorten with a "…" rather than wrap. There's a standard
line of CSS for that. **It silently does nothing** in the two places you'd
naturally put it — directly on a table cell, or on inline text.

No error. The text just quietly spills into the next column.

> **The rule:** put it on a wrapper inside the cell, once, and it works
> everywhere.

---

## What the toolkit actually checks

Four checks. Three run instantly with nothing installed. The fourth opens a real
browser.

| Check | What it catches | Plain-English example |
|---|---|---|
| **Sizes** | text styles that collide or swap order | "your page title and screen title are both 32px on desktop" |
| **Contrast** | text that fails readability at phone size | the 16px-vs-18px trap above |
| **Rules** | shrinking tap targets, dead "…", unjustified breakpoints | "this focus outline gets thinner on mobile" |
| **Measure** | what the browser *actually drew* | "this column says 44px and rendered 52.8px" |

All four fail loudly enough to stop a build, so they can run automatically on
every change.

The last one matters most. As the Pulse doc put it:

> Fluid design needs measurement, because its failures are a few pixels wide and
> invisible in review.

---

## We tested it on three real screens

Not a demo. Three actual builds, each one run through the toolkit start to
finish.

| | Screen | What we gave it |
|---|---|---|
| **1** | Item Catalogue — desktop → phone | one Figma frame |
| **2** | Station Dashboard — phone → desktop | one Figma frame |
| **3** | A simple table | **nothing at all** |

All three passed in the end. Getting there took four fixes — and **three of the
four bugs were in our own code**, written by someone who had just finished
writing the rules down.

### The one worth telling people about

A pinned column was set to 170px. It rendered at **195px**, then **229px** as
the window grew.

The cause was exactly problem #3 above: six columns adding up to 610px inside a
700px table, and nothing volunteering to absorb the 90px left over.

That's the toolkit's own headline rule, broken in a build by the person who
wrote it. **The screenshot looked perfect.** Only the measurement caught it.

If you take one thing from this page, take that: *writing a rule down is not the
same as following it, and the only reliable difference is a check that runs.*

### The other three, briefly

- **An overlapping panel.** A photo block rendered on top of the description
  text — a layout setting that behaves one way horizontally and a completely
  different way vertically, and we flipped the direction without flipping it.
- **Hidden columns that weren't really hidden.** We hid four table columns, but
  a row spanning the full width kept them alive underneath, so width was handed
  to columns nobody could see.
- **A type scale with no room to breathe.** More on that below.

---

## Three things we found in the Pulse designs

### 1. Two titles are the same size on desktop

Straight from §2 of the Pulse doc:

| | Phone (390px) | Desktop (1440px) |
|---|---|---|
| Screen title | 20px | **32px** |
| Page title | 24px | **32px** |

On a phone these are clearly different. On a desktop they're identical — so the
hierarchy you can see on the small screen **disappears on the big one**. That's
backwards from what anyone would expect.

Two options: separate them by size, or accept it and make the difference
weight-based instead. Either is fine — but it should be a decision, not an
accident.

### 2. The text scale has no room underneath it

Pulse's body text sits at the smallest size we'd consider readable. Which means
a smaller "caption" style has nowhere to go — squeeze it and it lands on top of
body text.

Worth deciding: does Pulse want a caption style at all, or should small text be
handled with weight and colour instead of size?

### 3. Two sizes are off the spacing grid

14px card padding and 10px small print don't sit on the 4-point grid the rest of
the system uses. Recorded rather than silently rounded, but worth a decision.

---

## How to use it in your work

### If you're a designer

**Keep designing exactly two screens.** A phone and a desktop. That doesn't
change, and it's the whole point — you never mock up anything in between,
because the maths already decided it.

What *does* change:

1. **Both frames get read directly.** If you've drawn both a phone and a desktop
   frame, the toolkit takes the real numbers from both. Nothing is invented, so
   design and build can't drift apart at the two widths anyone actually reviews.

2. **If only one frame exists, it says so.** It'll propose the missing sizes and
   label every one of them a *proposal*, not a measurement. Those are exactly
   the numbers worth five minutes of your attention.

3. **You'll get asked three or four questions, not twenty.** And only ones a
   tool genuinely can't work out — the main one being: *is the mobile menu the
   same list as the desktop menu?* Usually it isn't. Some things get promoted
   into the tab bar, admin tools get pushed behind a menu. That's a product
   decision and nobody but you can make it.

4. **You'll get told when your scale doesn't fit.** If two text styles would
   land on the same size once compressed to a phone, it stops and gives you
   options rather than quietly picking one.

### If you're an engineer

1. **Stop hand-writing size values.** Sizes get generated from a single settings
   file. You edit that file, never the generated stylesheet.

2. **Run the checks before you push.** Three of them need nothing installed.

3. **Put them in CI.** All four fail a build when something's wrong. This is how
   the 44px-renders-as-52.8px class of bug stops reaching production.

4. **Before you add a breakpoint, write down the question it answers.** If you
   can't, it shouldn't be a breakpoint — it should be a smooth value. The tool
   enforces this.

### Either way

The workflow is **build first, ask second**. It doesn't interrogate you before
producing anything. It builds something real using sensible defaults, tells you
in one line what it assumed, and asks only about the things that would be
expensive to get wrong. Correcting an assumption takes a sentence; answering
twenty questions up front takes an afternoon and puts people off using it.

---

## Setting it up

Works in all three tools. Same rules, three wrappers. You need Node 18+ and
nothing else.

```bash
git clone https://github.com/jaydemetillo/fluid-responsive-designs.git
cd fluid-responsive-designs
node test/run.mjs        # 15 checks, should all pass
```

### Claude Code

One command makes it the **Fluid Responsive** skill:

```bash
ln -s "$PWD" ~/.claude/skills/fluid-responsive
```

Restart Claude Code. You don't have to name it — ask for *"the mobile version of
this"* or *"make this responsive"* and it picks itself up. Type
`/fluid-responsive` if you want it explicitly.

### Codex

Codex reads a file called `AGENTS.md`. Copy the one from the repo into whatever
project you're working on:

```bash
cp AGENTS.md /path/to/your-project/AGENTS.md
```

If that project already has an `AGENTS.md`, paste the contents in as a section
instead of overwriting it.

### Cursor

Cursor reads rule files from a `.cursor/rules/` folder:

```bash
mkdir -p /path/to/your-project/.cursor/rules
cp .cursor/rules/fluid-responsive.mdc /path/to/your-project/.cursor/rules/
```

It attaches itself automatically whenever you touch a stylesheet or a settings
file — no need to mention it.

### The optional extra

The check that opens a real browser needs one more step:

```bash
npm install && npx playwright install chromium
```

Skip it if you only want the sizes generated and the instant checks. Add it when
you want the class of bug that humans genuinely cannot see.

Full setup notes, including CI, are in `INSTALL.md` in the repo.

---

## What it can't do

Being straight about the edges:

- **Some bugs have no automatic check.** One CSS rule quietly overriding another
  (§7 #4 in the Pulse doc) can only be caught by noticing the *result* in a real
  browser. That's an argument for measuring, not a gap we can close.
- **Colour checking needs your colours.** No colour values ship in the repo, so
  that check stays off until someone adds the palette.
- **It won't decide for you** whether a table becomes cards on a phone or scrolls
  sideways. That depends on whether people scan the table or read one row of it,
  and that's a design call.

---

## Decisions this turns from debates into switches

From §8 of the Pulse doc — these were open questions. Most are now just a choice:

1. **Should column drift fail the build?** It's a check with a pass/fail result
   now. Turning it on is one line.
2. **Do we adopt 390/1440 as the standard Pulse pair?** If yes, every Pulse
   screen inherits one scale from one file.
3. **Should column drop-order live as data instead of scattered CSS?** Already
   built that way — it just needs the actual order filled in.
4. **Container queries?** The doc called this the biggest available improvement.
   It's now the recommended default for anything a *component* decides about
   itself.

Still genuinely open, and needing design rather than engineering: whether table
rows become cards on small phones, and whether column headers get short forms
written by design instead of being truncated.

---

## Try it

```bash
git clone https://github.com/jaydemetillo/fluid-responsive-designs.git
cd fluid-responsive-designs
node test/run.mjs                                    # 15 checks, no install
python3 -m http.server 4178 --directory examples     # the three test screens
```

Then open the three screens and drag your browser window from full width down to
phone width. That's the whole idea in about ten seconds.
