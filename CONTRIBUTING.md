# Contributing to wk

Thanks for contributing!

## Prerequisites

- Bun 1.0+
- Git 2.35+

## Setup

```bash
bun install
```

## Development commands

```bash
bun test
bun run typecheck
bun run lint
bun run compile
```

## Local CLI usage

Run directly:

```bash
bun run src/index.ts --help
```

Link globally while developing:

```bash
bun link
wk --help
```

## Pull request checklist

- Keep scope focused and small.
- Add/update tests for behavior changes.
- Run tests, typecheck, and lint before opening a PR.
- Update docs when commands or behavior change.
