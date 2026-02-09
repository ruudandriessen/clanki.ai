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

## Code Style

### Prefer `??` over `||` for default values

Use the nullish coalescing operator (`??`) instead of logical OR (`||`) when providing fallback/default values. `??` only falls back on `null`/`undefined`, while `||` also falls back on `0`, `""`, and `false` — which are often valid values.

```ts
// Good — only falls back when value is null/undefined
const color = colors[name] ?? "#default";
const count = counts[key] ?? 0;

// Bad — would also fall back on 0, "", or false
const color = colors[name] || "#default";
const count = counts[key] || 0;
```

Keep `||` for boolean logic (e.g., `a > 0 || b > 0`) and sort tiebreakers (e.g., `a.localeCompare(b) || a.x.localeCompare(b.x)`).
