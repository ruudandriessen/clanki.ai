# CLAUDE.md

## Project

Bun monorepo with a Cloudflare Worker backend (`worker/`) and React + Vite frontend (`frontend/`).

## Commands

- `bun install` — install dependencies
- `bun run build` — build all packages
- `bun run dev` — start both worker and frontend in dev mode

## Commits

This project enforces [Conventional Commits](https://www.conventionalcommits.org/) via commitlint in CI.

Format: `<type>(<optional scope>): <description>`

Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.

Examples:
- `feat: add user login flow`
- `fix(worker): handle empty request body`
- `docs: update README with deploy steps`
