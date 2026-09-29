# Contributing

Thanks for helping improve next-granular-images.

## Setup

Requirements: Node.js >= 20.19 and [pnpm](https://pnpm.io) (the version is pinned in `packageManager`).

```bash
pnpm install
pnpm build
```

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Full Vitest run (all projects) |
| `pnpm test:unit` / `test:pipeline` / `test:types` / `test:cli` / `test:react` | A single test project |
| `pnpm test:coverage` | Tests with coverage thresholds (used by CI) |
| `pnpm build` | Build the client and CLI with tsup |
| `pnpm dev` | tsup in watch mode |

CLI tests run against the built binary, so run `pnpm build` first if you touch `src/cli`.

## Test layout

Tests live in `tests/`, split by what they exercise:

- `unit/`: pure functions (config, hashing, paths, helpers).
- `pipeline/`: real `sharp` processing and the commands, run in-process.
- `typegen/`: generated TypeScript compiled with the TypeScript API.
- `cli/`: end-to-end against the built binary.
- `react/`: components with Testing Library.
- `helpers/`: shared fixtures.

Bug fixes should come with a test that fails without the fix.

## Commits

Conventional commits with a gitmoji: `type: :gitmoji: subject`, lowercase, imperative.

```
fix: :bug: stop applying className to both the wrapper and the img
docs: :memo: add Unreleased section to the changelog
test: :white_check_mark: cover init, clean and command exits in-process
```

Common types: `feat`, `fix`, `docs`, `test`, `build`, `ci`, `chore`, `refactor`. Keep each commit to one reviewable unit, with its tests and docs.

## Pull requests

1. Branch from `main`.
2. Make sure `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` and `npm pack --dry-run` pass. CI runs them on Node 20 and 22 with sharp 0.33 and 0.34.
3. Add an entry under `## [Unreleased]` in `CHANGELOG.md` for user-visible changes. Do not bump the version; releases do that.
4. Fill in the PR template and explain the why.

Dependencies are pinned and Renovate waits 30 days after release, so please do not bump them in unrelated PRs.
