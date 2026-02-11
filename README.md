# wk

`wk` is a CLI for managing git worktrees in a global depot. Built with [Bun](https://bun.dev/).

It keeps worktrees outside your repo (default `~/.worktrees/<repo-id>/<name>`) so your main working directory stays clean.

## Typical workflow

```bash
# Create a worktree from main
wk new t1-1234-example main --repo /path/to/repo

# Work inside the worktree
cd "$(wk path t1-1234-example --repo /path/to/repo)"

# Apply changes back to the main repo using merge mode (default)
wk apply t1-1234-example --repo /path/to/repo

# Remove worktree metadata once done
wk rm t1-1234-example --repo /path/to/repo
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

- `--merge` (default): merges worktree branch into `--target` (default `main`)
- `--rebase`: rebases ticket branch onto target, then fast-forwards target
- `--patch`: applies a patch from merge-base to current worktree state (includes uncommitted tracked changes)
- `--switch`: checks out the ticket branch in the main repo (no merge)
- `--merge` and `--rebase` do not include uncommitted worktree changes
- `wk apply` will fail if the main repo is dirty for non-patch modes

## Want to use with AI?

Copy this into an `AGENTS.md` or similar and adjust branch/base defaults for your project:

```md
## Worktrees (Required)

- Use `wk` to manage worktrees. Do not use raw `git worktree` directly.
- Branch names should include the ticket key.

### Safe flow

1. Create a ticket branch/worktree from your integration branch:

   `wk new <ticket-branch> <base> --repo <repo-path>`

2. Before editing files in the main repo, apply and attach to the ticket branch:

   `wk apply <ticket-branch> --repo <repo-path> --switch`

3. Verify attached branch:

   `git status -sb`

   Expected output starts with: `## <ticket-branch>`

4. After review/merge, remove the worktree:

   `wk rm <ticket-branch> --repo <repo-path>`

### Apply behavior

- `wk apply <name> --switch` moves the repo checkout to branch tip.
- It does not transfer uncommitted changes from another worktree.
- Commit or stash worktree-local changes before apply-based review.
```

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

## Contributing

See `CONTRIBUTING.md` for contributor workflow and quality checks.
