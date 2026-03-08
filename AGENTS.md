# AGENTS.md

## Project

Bun app with a TanStack Start backend deployed on Vercel and a React + Vite frontend.

## Commands

- `bun install` — install dependencies
- `bun run build` — build all packages
- `bun run dev` — start both worker and frontend in dev mode
- `bun run format` — format code with oxfmt
- `bun run lint:fix` — lint and auto-fix with oxlint
- `bun run knip` — detect unused files, exports, and dependencies

## Pre-commit

Always run `bun run format`, `bun run lint:fix`, and `bun run knip` before committing.

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

### Keep functions in dedicated files

Split reusable functions into dedicated files instead of grouping many unrelated functions in one file. Keep files focused on a single concern, and prefer extracting helper functions once they are shared across modules or grow beyond small local logic.

### Keep configuration surface minimal

Do not introduce new environment variables, feature flags, or configuration options unless explicitly requested by the user/product requirement.

Prefer sensible defaults and direct implementation over optional knobs. If configurability is needed later, add it in a follow-up change when requested.

### React Compiler: avoid manual memoization by default

This project uses the React Compiler. Do not add `useMemo`/`useCallback` for routine derived values or inline handlers unless there is a specific non-compiler reason.

- Prefer direct expressions and plain functions in components.
- Only add memoization when required for correctness or integration constraints (for example, stable identity required by an external API).

### Avoid `useEffect` unless it is actually required

Do not introduce `useEffect` for routine derivations, event handling, or state synchronization that can be expressed directly during render or through existing data flow.

- Prefer deriving values from props/state inline.
- Prefer handling user actions in event handlers.
- Only use `useEffect` when you are synchronizing with an external system or browser API and there is no simpler render-driven approach.

### Use shadcn components where applicable

For new UI work, prefer existing shadcn primitives from `frontend/src/components/ui` (for example `Button`, `Input`, `Textarea`, `Dialog`, `DropdownMenu`, `Card`, `Avatar`) instead of custom base controls.

Only create custom component wrappers when there is no suitable shadcn primitive or when product-specific behavior requires it.

### Design style (neobrutal, but clean)

The app's visual direction is neobrutalist: bold palette, clear borders, and strong typography.

Apply this style with restraint:

- Keep borders and shadows moderate (`border` over `border-2` by default).
- Prefer flat or lightly elevated surfaces for dense UI areas (sidebar, chat timeline, tool summaries).
- Avoid stacked boxed treatments in repeated lists (for example tool activity rows).
- Preserve readability first: generous spacing, clear contrast, and calm message surfaces.
- Keep the login page and top-level marketing-like surfaces visually expressive; keep operational areas cleaner.

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

### Avoid unnecessary defensive code

Do not add speculative fallbacks, extra guards, or `throw` statements for cases the application does not expect to happen.

- Prefer the direct code path that matches the actual product assumptions.
- Add defensive handling only when there is a concrete, known failure mode to support.
- Do not introduce "safety" defaults that can hide real bugs or make behavior harder to reason about.

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

## Execution Roadmap

The product direction is to move from Vercel sandboxes to a local runner model built on git worktrees, while preserving a clean path to future remote or self-hosted runners.

The local app shell should be built with `Electron`, not as a pure PWA.

### System components

The system is split into three main components:

1. **Vercel backend** — the API layer deployed on Vercel. Handles syncing with external systems (e.g. GitHub), stores PR data, projects, and other persisted domain state. This is the control plane.
2. **Runner** — a self-hosted runner that (for now) runs on the client's device. Manages sessions, runs code in git worktrees, and performs the real execution operations. Requires `opencode` to be available as a CLI tool on the host machine (manual prerequisite). This is the execution plane.
3. **Desktop app** — an Electron shell wrapping the Vercel-hosted frontend. This is the primary way users interact with the system. Hosts the local runner and provides native OS integration.

### Architecture direction

- Treat execution as a backend interface, not as a sandbox-specific implementation detail.
- Prefer the terms `runner`, `execution backend`, `workspace`, and `worktree` in new code and docs. Avoid introducing new sandbox-specific concepts unless touching legacy code that has not been migrated yet.
- Keep the control plane separate from the execution plane:
  - control plane (Vercel backend): syncing, persistence, auth, project/PR data
  - execution plane (runner): repo checkout/worktree lifecycle, process execution, OpenCode session wiring, preview process management
  - presentation layer (desktop app): UI, task lifecycle views, event history display
- Keep the current detached task runner and event streaming model backend-agnostic where possible so it can run locally now and remotely later.

### Local-first implementation steps

1. Introduce a runner abstraction in place of the current sandbox-specific API.
2. Add the `Electron` desktop shell around the existing app and use it as the host for local runner capabilities.
3. Implement a local worktree runner that can prepare a workspace, execute commands, launch detached processes, read files, and clean up.
4. Change task execution flow to target the runner abstraction instead of Vercel sandbox primitives.
5. Replace clone-per-run behavior with cached repo checkout plus per-task git worktrees.
6. Generalize persisted execution state so it no longer depends on `sandboxId` as the primary concept.
7. Replace sandbox-only preview, callback, and background-execution assumptions with local equivalents.
8. Add recovery and cleanup for crashed processes, stale worktrees, and port conflicts.

### Migration stance

- Do not spend time preserving Vercel sandbox compatibility for new runner work unless the user explicitly asks for it.
- Prefer direct local-runner implementations and clear runner-specific contracts over temporary compatibility layers around sandbox primitives.
- When migrating legacy sandbox code, optimize for removal and replacement rather than carrying sandbox concepts forward into new packages or APIs.

### Remote-ready constraints

- Do not hardcode local-only assumptions into the domain model if they would block a remote runner later.
- Prefer storing runner metadata such as runner type, workspace identifier, workspace path, process identifiers, and preview URL instead of only sandbox identifiers.
- Keep runner operations small and explicit so the same contract can later be implemented by a daemon on a self-hosted machine.
- Defer the remote implementation itself for now; design for it, but optimize the current work for the local runner first.

### Scope guardrails

- Do not introduce broad new configuration surfaces unless a concrete product need requires it.
- Prefer direct defaults for local execution over adding feature flags for every behavior.
- When migrating legacy sandbox code, prioritize runner-first replacements and only keep compatibility shims when they unblock an immediate user-facing requirement.
