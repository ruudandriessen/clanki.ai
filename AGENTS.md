# AGENTS.md

## Project

Bun monorepo with a Cloudflare Worker backend (`worker/`) and React + Vite frontend (`frontend/`).

## Commands

- `bun install` — install dependencies
- `bun run build` — build all packages
- `bun run dev` — start both worker and frontend in dev mode
- `bun run format` — format code with oxfmt
- `bun run lint:fix` — lint and auto-fix with oxlint

## Pre-commit

Always run `bun run format` and `bun run lint:fix` before committing.

## Commits

This project enforces [Conventional Commits](https://www.conventionalcommits.org/) via commitlint in CI.

Format: `<type>(<optional scope>): <description>`

Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.

Examples:

- `feat: add user login flow`
- `fix(worker): handle empty request body`
- `docs: update README with deploy steps`

## Code Style

### One component per file

Every React component must live in its own file. Do not define multiple components in a single `.tsx` file (except tiny local inline render helpers that are not reusable components).

### Use shadcn components where applicable

For new UI work, prefer existing shadcn primitives from `frontend/src/components/ui` (for example `Button`, `Input`, `Textarea`, `Dialog`, `DropdownMenu`, `Card`, `Avatar`) instead of custom base controls.

Only create custom component wrappers when there is no suitable shadcn primitive or when product-specific behavior requires it.

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

### Type-safe route and search params (TanStack Router)

The router is registered in `frontend/src/router.tsx` via `declare module "@tanstack/react-router"`. This gives TanStack Router full type information about every route's path params and search params. Always use this — never bypass it with `strict: false` or type assertions.

**Route params** — use `from` so the types are inferred from the route tree. The `from` value is the **route ID**, which includes ID-route parents (e.g. the `layout` ID route makes the task route ID `/layout/tasks/$taskId`, even though the URL is `/tasks/$taskId`):

```ts
// Good — fully type-safe, inferred from the registered route tree
const { taskId } = useParams({ from: "/layout/tasks/$taskId" });

// Bad — opts out of type safety
const { taskId } = useParams({ strict: false }) as { taskId: string };
```

**Search params** — define a `validateSearch` on the route so `useSearch` returns typed values:

```ts
// In the route definition (router.tsx or a route file)
const myRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/my-route",
  validateSearch: (search: Record<string, unknown>) => ({
    page: Number(search.page ?? 1),
    filter: (search.filter as string) ?? "",
  }),
  component: MyComponent,
});

// In the component — fully typed { page: number, filter: string }
// Note: from uses route ID "/layout/my-route" since parent is the layout ID route
const { page, filter } = useSearch({ from: "/layout/my-route" });
```

**Navigate / Link** — `to` uses the **URL path** (not the route ID), so it does not include ID-route prefixes:

```tsx
navigate({ to: "/tasks/$taskId", params: { taskId: id } });
<Link to="/tasks/$taskId" params={{ taskId: id }}>
  Task
</Link>;
```

**Rules:**

- Never use `strict: false` on `useParams` or `useSearch` — it returns a union of all routes and defeats type safety.
- Never use `as` type assertions to cast param/search types.
- Always pass `from` (the **route ID**) to `useParams` and `useSearch` so types are inferred. Route IDs include ID-route parent prefixes (e.g. `/layout/...`), while `to` uses URL paths.
- When adding search params to a route, always add `validateSearch` with sensible defaults so malformed URLs don't crash the app.
