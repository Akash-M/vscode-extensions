# vscode-extensions

A Yarn 4 monorepo for VS Code extensions. Each extension lives in its own package under [`packages/`](./packages).

## Packages

| Package | Description |
| --- | --- |
| [`token-anxiety-manager`](./packages/token-anxiety-manager) | See what every AI coding request costs — before you send it. Tool-agnostic across Copilot, Claude, and Codex. |

## Prerequisites

- **Node.js >= 20**
- **Yarn 4** via Corepack (no global install needed):

```bash
corepack enable
```

The pinned Yarn version is declared in [`package.json`](./package.json) (`packageManager`) and uses the **node-modules** linker (see [`.yarnrc.yml`](./.yarnrc.yml)) — not Plug'n'Play.

## Getting started

```bash
corepack enable          # one-time, enables the pinned Yarn
yarn install             # install all workspaces
yarn build               # build every package
yarn typecheck           # type-check every package
```

## Adding a new extension

```bash
mkdir -p packages/<name>/src
# add packages/<name>/package.json (extends the patterns in token-anxiety-manager)
# add packages/<name>/tsconfig.json that extends ../../tsconfig.base.json
yarn install
```

Workspaces are globbed from `packages/*`, so a new folder with a `package.json` is picked up automatically.

## Conventions

- Shared TypeScript settings live in [`tsconfig.base.json`](./tsconfig.base.json); each package extends it.
- Extensions bundle with **esbuild** and type-check with **tsc --noEmit**.
- Run a package script directly with `yarn workspace <pkg-name> <script>`.
