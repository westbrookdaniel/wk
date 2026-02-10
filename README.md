# wt

Bun + TS CLI for managing git worktrees in a global depot

## Commands

```
wt new <name> [base] [--repo <path>] [--depot <path>] [--branch <branch>] [--no-branch]
wt list [--repo <path>] [--depot <path>] [--all]
wt path <name> [--repo <path>] [--depot <path>]
wt rm <name> [--repo <path>] [--depot <path>] [--force] [--delete-branch] [--keep-branch]
wt apply <name> [--repo <path>] [--depot <path>] [--target <branch>] [--merge|--rebase|--patch] [--no-ff] [--message <msg>]
wt prune [--repo <path>] [--depot <path>]
```

Default depot:
`~/.worktrees/<repo-id>/<name>`

## Notes:

- Default apply mode is merge: merges worktree branch into target (default: main).
- Merge/rebase do NOT include uncommitted worktree changes. Use --patch for that.
