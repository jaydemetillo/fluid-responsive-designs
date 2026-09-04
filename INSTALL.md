# Setting it up

Works in Claude Code, Codex, and Cursor. Same rules, three wrappers.

You need Node 18 or newer. Nothing else, unless you want the live browser check.

```bash
git clone https://github.com/jaydemetillo/fluid-responsive-designs.git
cd fluid-responsive-designs
node test/run.mjs        # 15 checks, should all pass
```

---

## Claude Code

Link the repo into your skills folder and it becomes the **Fluid Responsive**
skill, callable as `/fluid-responsive`:

```bash
ln -s "$PWD" ~/.claude/skills/fluid-responsive
```

Restart Claude Code. Ask it to *"make this responsive"*, *"build the mobile
version"*, or *"scale this design up to desktop"* and it will pick the skill up
on its own — you don't have to name it.

To share it with a team, commit the repo somewhere they can clone and have
everyone run the same `ln -s`.

**Per-project instead of global:** put it at `.claude/skills/fluid-responsive`
inside a project and only that project sees it.

---

## Codex

Codex reads a file called `AGENTS.md`. This repo ships one at its root.

**If you're working inside this repo**, nothing to do — it's already there.

**To use it on another project**, copy the file over:

```bash
cp AGENTS.md /path/to/your-project/AGENTS.md
```

If that project already has an `AGENTS.md`, paste the contents in as a section
rather than overwriting it.

The scripts still live in this repo, so either clone it beside your project or
copy the `scripts/` and `profiles/` folders across.

---

## Cursor

Cursor reads rule files from `.cursor/rules/`. This repo ships one.

```bash
mkdir -p /path/to/your-project/.cursor/rules
cp .cursor/rules/fluid-responsive.mdc /path/to/your-project/.cursor/rules/
```

It's set to attach automatically when you touch CSS, SCSS, Tailwind config, or
token files — you don't have to mention it. To have it always on, open the file
and change `alwaysApply: false` to `true`.

---

## The optional extra: checking a real browser

Three of the four checks run on plain Node with nothing installed. The fourth
one — `measure` — opens an actual browser, because some problems only exist
once a page has been laid out. A column can say 44px in the CSS and render at
52.8px, and no amount of reading the stylesheet will tell you that.

```bash
npm install
npx playwright install chromium
```

Then:

```bash
node scripts/measure.mjs http://localhost:3000 --profile .utopia/profile.json
```

Skip this if you just want token generation and the static checks.

---

## Using it on a project that isn't this one

The scripts read a **profile** — a single JSON file holding your sizes, your
floors, and your breakpoints. Everything else reads from that.

```bash
# from your project folder, pointing at wherever you cloned this repo
FR=~/fluid-responsive-designs

node $FR/scripts/detect.mjs .                                     # what's already here?
node $FR/scripts/init.mjs --refs refs.json --out .utopia          # make a profile
node $FR/scripts/generate.mjs --profile .utopia/profile.json --out src/tokens.css
node $FR/scripts/sweep.mjs src/tokens.css --profile .utopia/profile.json
node $FR/scripts/audit.mjs src/ --profile .utopia/profile.json
```

Commit `.utopia/profile.json` and `tokens.css`. Edit the profile, never the CSS —
regenerating overwrites it.

---

## Putting the checks in CI

All four exit non-zero when something's wrong, so they drop straight in:

```yaml
- run: node scripts/sweep.mjs src/tokens.css --profile .utopia/profile.json
- run: node scripts/audit.mjs src/ --profile .utopia/profile.json
- run: node scripts/contrast.mjs src/tokens.css --profile .utopia/profile.json
```

Add `measure` too if you have a preview URL to point it at. That's the one that
catches problems a human reviewer genuinely cannot see.
