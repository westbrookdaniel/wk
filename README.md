# wk

`wk` is a CLI for managing git worktrees in a global depot. Built with [Bun](https://bun.dev/).

It keeps worktrees outside your repo (default `~/.worktrees/<repo-id>/<name>`) so your main working directory stays clean.

## Examples

```bash
# Create a worktree from main in current git repo
wk new example-branch main

# Work inside the worktree
cd "$(wk path example-branch)"

# Apply changes back to the main repo using merge mode (default)
wk apply example-branch

# Remove worktree metadata
wk rm example-branch
```

## AI Workflows

There are lots of AI workflows that this tool enables.
I would recommend one that integrates with your task/ticket management tool like this:

- Ask agent to work on tickets A, B and C using wk
  - Ask agent to plan before working if necessary
- Agent uses MCPs to access ticket information
- Creates and completes tickets in worktrees
- Begin the apply based review. The agent will apply each ticket into the original repo
  to allow for manual testing, requesting additional changes, and code review.
- Approve the branch and ask it to create the relevant PR in Github/Gitlab etc

Copy this into an `AGENTS.md` or similar:

````md
## Worktrees (Required)

- If asked to use worktrees, use the **`wk` CLI** (not raw `git worktree`).
- Assume `wk` is available in shell as `wk`.

### Worktree Safety Checks (Required)

- After `wk new ...`, immediately run `wk apply <name> --repo <repo>` before editing files.
- Before making code changes, verify you are attached to the ticket branch (not detached):

```bash
git status -sb
```

- Expected: `## <ticket-branch-name>`
- If you see `## HEAD (no branch)`, stop and attach to the branch before editing.

### Apply Behavior (Important)

- `wk apply <name> --repo <repo> --switch` switches the target repo to the branch tip.
- It does **not** transfer uncommitted changes from another worktree.
- For apply-based review, commit your work on the ticket branch first, then run `wk apply ... --switch`.

Common usage:

```bash
wk new <branch-name> <base> --repo ./coreplan
wk new <branch-name> <base> --repo ./coreplan-web
wk new <branch-name> <base> --repo ./capture
wk list --repo ./coreplan
wk path <name> --repo ./coreplan
wk apply <name> --repo ./coreplan
wk rm <name> --repo ./coreplan
```

### Apply-Based Review Gate (Required when requested)

- If the user asks for an apply-based review flow, apply each ticket branch into the target repo
  first with `wk apply <name> --repo <repo> --switch` (or use another explicit target mode if requested).
- After apply, share a concise review summary (what changed, where, why) and what to validate manually.
- **Do not run `gt submit`** until the user explicitly approves after reviewing the applied changes.
- Once approved and submitted, clean up the branch/worktree with `wk rm <name> --repo <repo>`.
- Keep one ticket per branch/worktree and move each branch through review independently.

## PR Quality Checklist

Before submitting a PR:

- Ticket key included in branch and commit(s)
- Standard commit formats followed
- Scope limited to ticket requirements
- Lint/types/tests run for touched area
- No secrets or env files committed
- PR body follows repo template
````

## Installation

Clone and install:

```bash
git clone <your-fork-or-repo-url>
cd wk
bun install
bun run compile
```

Binary setup:

```bash
# Link the CLI globally
bun link
wk --help

# Build a standalone binary
bun run compile
./dist/wk --help
```

## Command Reference

```bash
wk new <name> [base] [--repo <path>] [--depot <path>] [--branch <branch>] [--no-branch]
wk list [--repo <path>] [--depot <path>] [--all]
wk path <name> [--repo <path>] [--depot <path>]
wk rm <name> [--repo <path>] [--depot <path>] [--force] [--delete-branch] [--keep-branch]
wk apply <name> [--repo <path>] [--depot <path>] [--target <branch>] [--merge|--rebase|--patch|--switch] [--no-ff] [--message <msg>]
wk prune [--repo <path>] [--depot <path>]
```

### Global flags and defaults

- `--repo <path>`: optional. Default is current working directory (`cwd`), resolved to repo root.
- `--depot <path>`: optional. Default is `~/.worktrees`.
- `-h, --help`: show help.

### `wk new <name> [base]`

- `base`: positional, optional. Default: `main`.
- `--branch <branch>`: optional. Default: `<name>`.
- `--no-branch`: optional bool. Default: `false`.
  - If true, creates a worktree at `base` without creating/checking out a new branch.

### `wk list`

- `--all`: optional bool. Default: `false`.
  - If true, prints `git worktree list` output for the repo.

### `wk path <name>`

- No command-specific flags beyond global flags.

### `wk rm <name>`

- `--force`: optional bool. Default: `false`.
- `--delete-branch`: optional bool. Default: `false`.
- `--keep-branch`: optional bool. Default: `false`.
  - Effective behavior: branch is deleted only when `--delete-branch` is true and `--keep-branch` is false.

### `wk apply <name>`

- `--target <branch>`: optional. Default: `main`.
- Mode flags: `--merge`, `--rebase`, `--patch`, `--switch`.
  - Default mode is `--merge` when no mode flags are provided.
  - If multiple of `--merge|--rebase|--patch` are passed, precedence is: `--patch`, then `--rebase`, then `--merge`.
- `--switch`: optional bool. Default: `false`.
  - If true, checks out `<name>` in the target repo and does not merge.
- `--no-ff`: optional bool. Default: `false`.
  - Only used with merge mode (`--merge`).
- `--message <msg>`: optional. No default.
  - Only used with patch mode (`--patch`) to auto-commit staged patch changes.

### `wk prune`

- No command-specific flags beyond global flags.

- `--merge` (default): merges worktree branch into `--target` (default `main`)
- `--rebase`: rebases ticket branch onto target, then fast-forwards target
- `--patch`: applies a patch from merge-base to current worktree state (includes uncommitted tracked changes)
- `--switch`: checks out the ticket branch in the main repo (no merge)
- `--merge` and `--rebase` do not include uncommitted worktree changes
- `wk apply` will fail if the main repo is dirty for non-patch modes

## Contributing

See `CONTRIBUTING.md` for contributor workflow and quality checks.
