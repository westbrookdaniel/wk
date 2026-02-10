# wk

Bun + TS CLI for managing git worktrees in a global depot

## Commands

```
wk new <name> [base] [--repo <path>] [--depot <path>] [--branch <branch>] [--no-branch]
wk list [--repo <path>] [--depot <path>] [--all]
wk path <name> [--repo <path>] [--depot <path>]
wk rm <name> [--repo <path>] [--depot <path>] [--force] [--delete-branch] [--keep-branch]
wk apply <name> [--repo <path>] [--depot <path>] [--target <branch>] [--merge|--rebase|--patch] [--no-ff] [--message <msg>]
wk prune [--repo <path>] [--depot <path>]
```

Default depot:
`~/.worktrees/<repo-id>/<name>`

## Notes:

- Default apply mode is merge: merges worktree branch into target (default: main).
- Merge/rebase do NOT include uncommitted worktree changes. Use --patch for that.
