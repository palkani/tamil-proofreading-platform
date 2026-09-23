# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Antigravity Kit is an AI-powered design intelligence toolkit providing searchable databases of UI styles, color palettes, font pairings, chart types, and UX guidelines. It works as a skill/workflow for AI coding assistants (Claude Code, Windsurf, Cursor, etc.).

## Search Command

```bash
python3 src/ui-ux-pro-max/scripts/search.py "<query>" --domain <domain> [-n <max_results>]
```

**Domain search:**
- `product` - Product type recommendations (SaaS, e-commerce, portfolio)
- `style` - UI styles (glassmorphism, minimalism, brutalism) + AI prompts and CSS keywords
- `typography` - Font pairings with Google Fonts imports
- `color` - Color palettes by product type
- `landing` - Page structure and CTA strategies
- `chart` - Chart types and library recommendations
- `ux` - Best practices and anti-patterns

**Stack search:**
```bash
python3 src/ui-ux-pro-max/scripts/search.py "<query>" --stack <stack>
```
Available stacks: `html-tailwind` (default), `react`, `nextjs`, `astro`, `vue`, `nuxtjs`, `nuxt-ui`, `svelte`, `swiftui`, `react-native`, `flutter`, `shadcn`, `jetpack-compose`

## Architecture

```
src/ui-ux-pro-max/                # Source of Truth
├── data/                         # Canonical CSV databases
│   ├── products.csv, styles.csv, colors.csv, typography.csv, ...
│   └── stacks/                   # Stack-specific guidelines
├── scripts/
│   ├── search.py                 # CLI entry point
│   ├── core.py                   # BM25 + regex hybrid search engine
│   └── design_system.py          # Design system generation
└── templates/
    ├── base/                     # Base templates (skill-content.md, quick-reference.md)
    └── platforms/                # Platform configs (claude.json, cursor.json, ...)

cli/                              # CLI installer (uipro-cli on npm)
├── src/
│   ├── commands/init.ts          # Install command with template generation
│   └── utils/template.ts         # Template rendering engine
└── assets/                       # Bundled assets (~564KB)
    ├── data/                     # Copy of src/ui-ux-pro-max/data/
    ├── scripts/                  # Copy of src/ui-ux-pro-max/scripts/
    └── templates/                # Copy of src/ui-ux-pro-max/templates/

.claude/skills/ui-ux-pro-max/     # Claude Code skill (symlinks to src/)
.factory/skills/ui-ux-pro-max/   # Droid (Factory) skill (symlinks to src/)
.shared/ui-ux-pro-max/            # Symlink to src/ui-ux-pro-max/
.claude-plugin/                   # Claude Marketplace publishing
```

The search engine uses BM25 ranking combined with regex matching. Domain auto-detection is available when `--domain` is omitted.

## Sync Rules

**Source of Truth:** `src/ui-ux-pro-max/`

When modifying files:

1. **Data & Scripts** - Edit in `src/ui-ux-pro-max/`:
   - `data/*.csv` and `data/stacks/*.csv`
   - `scripts/*.py`
   - Changes automatically available via symlinks in `.claude/`, `.factory/`, `.shared/`

2. **Templates** - Edit in `src/ui-ux-pro-max/templates/`:
   - `base/skill-content.md` - Common SKILL.md content
   - `base/quick-reference.md` - Quick reference section (Claude only)
   - `platforms/*.json` - Platform-specific configs

3. **CLI Assets** - Run sync before publishing:
   ```bash
   cp -r src/ui-ux-pro-max/data/* cli/assets/data/
   cp -r src/ui-ux-pro-max/scripts/* cli/assets/scripts/
   cp -r src/ui-ux-pro-max/templates/* cli/assets/templates/
   ```

4. **Reference Folders** - No manual sync needed. The CLI generates these from templates during `uipro init`.

## Prerequisites

Python 3.x (no external dependencies required)

## Project Commands

Used by the PR workflow below. Run all commands from the repo root. If a command fails because a tool, script, or folder isn't set up yet (e.g. no `tests/` folder, no `test` script in `cli/package.json`), skip that check and say so in the final report. Never invent a command that doesn't exist.

| Check | Command |
|-------|---------|
| Python tests | `python3 -m unittest discover -s tests -v` |
| CLI tests | `cd cli && npm test` |
| Python coverage | `python3 -m coverage run -m unittest discover -s tests && python3 -m coverage report -m` |
| Python lint | `ruff check src/ui-ux-pro-max/scripts` |
| CLI lint | `cd cli && npx eslint src` |
| CLI type check | `cd cli && npx tsc --noEmit` |
| CLI build | `cd cli && npm run build` |
| Python syntax check | `python3 -m py_compile src/ui-ux-pro-max/scripts/*.py` |
| Search smoke test | `python3 src/ui-ux-pro-max/scripts/search.py "saas dashboard" --domain style -n 3` |
| CLI asset sync check | `diff -r -x __pycache__ src/ui-ux-pro-max/data cli/assets/data && diff -r -x __pycache__ src/ui-ux-pro-max/scripts cli/assets/scripts && diff -r src/ui-ux-pro-max/templates cli/assets/templates` |

Notes:
- Python tests use the built-in `unittest`, so the runtime stays dependency-free. New Python tests go in `tests/` as `test_<module>.py`.
- `coverage` and `ruff` are dev-only tools: `pip install coverage ruff`.
- The asset sync check must print nothing. Any output means `cli/assets/` is out of sync; run the sync commands in **Sync Rules**.

## Git Workflow and PR Process (required for every change)

Never push directly to `main`. Follow every step below in order for every change. Do not skip steps.

### Step 1: Create a branch
- `git checkout main && git pull origin main`
- `git checkout -b feat/<short-name>` or `fix/<short-name>`

### Step 2: Make the changes
- Edit only in the source of truth (`src/ui-ux-pro-max/`), following the **Sync Rules** above.
- If anything in `data/`, `scripts/`, or `templates/` changed, run the CLI asset sync commands so `cli/assets/` matches.

### Step 3: Run the existing tests (baseline)
- Before writing any new tests, run the full existing suite (**Tests** command).
- If existing tests fail because of my changes, fix the code, not the tests. Only update an old test when the behavior change is intentional, and explain why in the commit message.
- If a test was already failing before my changes, confirm it: `git stash`, re-run the tests, then `git stash pop`. Note pre-existing failures in the report instead of silently fixing or skipping them.

### Step 4: Add tests for every new change
For each new or modified function, component, command, or module:
- **Happy path:** expected input produces expected output.
- **Edge cases:** empty values, None/null/undefined, zero, very large inputs, boundary values, special characters and Unicode (including Tamil and other non-Latin text in search queries).
- **Error cases:** invalid input, missing or malformed CSV rows, missing files, failed network calls; confirm errors are raised or handled correctly.
- **Regression:** if the change fixes a bug, add a test that fails without the fix and passes with it.
- Match the existing test framework, file naming, and folder structure. Place tests where current tests live.
- Mock external services instead of calling them for real.
- Do not use `.skip`, `.only`, `xit`, or commented-out tests.

### Step 5: Self-review the diff
- Run `git fetch origin` and `git diff origin/main...HEAD`.
- Read each changed file in full context, not just the diff hunks.
- Check every change for:
  - **Correctness:** logic bugs, off-by-one errors, None/null handling, unhandled errors or promises, broken edge cases.
  - **Security:** command injection, path traversal, XSS in generated templates, hardcoded secrets or API keys, unvalidated user input.
  - **Performance:** unnecessary loops, repeated file or CSV reads, oversized payloads or bundled assets.
  - **Code quality:** dead code, leftover debug `print`/`console.log` statements (normal CLI output is fine), stray TODOs, duplicated logic, unclear names.
  - **Consistency:** follows existing patterns, folder structure, and conventions in this repo.
  - **Sync:** `cli/assets/` matches `src/ui-ux-pro-max/`; nothing was edited directly in symlinked folders (`.claude/`, `.factory/`, `.shared/`).
  - **Tests:** new or changed behavior has tests; no existing tests were deleted or weakened.

### Step 6: Verify and auto-fix
- Run every check in **Project Commands**: Python and CLI tests, coverage, lint, type check, build, Python syntax check, search smoke test, and CLI asset sync check.
- Fix every issue found in Steps 3–6, then re-run all checks.
- Repeat up to 3 rounds. If checks still fail after 3 rounds, stop, do not commit, and report the failures.
- New code should be covered by tests; list any uncovered lines in the report.
- **Do not auto-fix, flag for a human instead:** changes to public CLI flags or output format, CSV schema changes, published package config, or anything that needs a product decision.

### Step 7: Commit
- Commit only when all checks pass.
- Use clear messages: `feat: ...`, `fix: ...`, `test: add tests for <feature>`, `fix: address PR self-review findings`.
- Commit tests together with the code they cover, or as a separate `test:` commit.

### Step 8: Push and create the PR
- `git push -u origin <branch>`
- `gh pr create` with a description that includes what changed, why, and how it was tested.

### Step 9: Review after the PR is open
- Run `gh pr diff` and repeat the Step 5 checklist on the final PR diff.
- Run `gh pr checks` to watch CI. If a check fails, read the logs, fix the cause, repeat Steps 6–7, push, and re-check.
- Never force-push over someone else's commits, and never merge the PR yourself.

### Step 10: Report
End with a short summary:
- **Issues found**
- **What was fixed** (with commit hashes)
- **Tests:** number of new tests added, full suite pass/fail count, coverage for new code
- **Skipped checks:** any Project Commands not set up yet
- **Needs human review:** anything flagged and why
