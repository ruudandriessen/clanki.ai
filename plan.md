# Plan: Run OpenCode in Cloudflare Sandbox with Task Run Association

## Context

The goal is to run OpenCode inside a [Cloudflare Sandbox](https://developers.cloudflare.com/sandbox/) and associate that sandbox with each task run. The `sandboxId` column already exists in the `task_runs` table (`schema.ts:341`) but is always set to `null` (`tasks.ts:297`).

The Cloudflare Sandbox SDK (`@cloudflare/sandbox`) provides container-backed Durable Objects. Key properties:
- `getSandbox(env.Sandbox, id)` — gets or creates a sandbox by ID. **Same ID = same sandbox** (resume).
- `sleepAfter` option — auto-sleep after inactivity (default 10 min). After sleep, next request starts a fresh container.
- `sandbox.exec(cmd)` — run shell commands inside the container.
- `sandbox.gitCheckout(repo)` — clone a repo into the sandbox.
- `sandbox.setEnvVars({...})` — inject env vars (API keys, etc.).
- `sandbox.destroy()` — explicitly tear down a sandbox.

There's already an [official Claude Code + Sandbox example](https://github.com/cloudflare/sandbox-sdk/tree/main/examples/claude-code) that demonstrates this exact pattern.

## Current Flow

1. Frontend calls `POST /api/tasks/:taskId/runs` with a `messageId`
2. Worker creates a `taskRuns` row with `sandboxId: null`
3. Worker calls `executeTaskRun()` via `waitUntil`, which talks to an external OpenCode HTTP API
4. OpenCode runs outside of any sandbox — no isolation between tasks

## Proposed Architecture

Each **task** gets its own sandbox, identified by the task ID. The sandbox contains the cloned repo and a running OpenCode instance. Subsequent runs for the same task reuse the same sandbox (fast). After a configurable idle TTL (e.g. 15 min) with no new messages, the sandbox auto-sleeps and is recycled on next use.

```
┌─────────────────┐     ┌──────────────────────────────────────────┐
│  Worker (Hono)  │     │  Sandbox (container per task)             │
│                 │     │                                          │
│  POST /runs ────┼────►│  getSandbox(env.Sandbox, taskId)         │
│                 │     │  ┌────────────────────────────────────┐  │
│  executeTaskRun │     │  │ /workspace/repo (cloned once)      │  │
│                 │     │  │ OpenCode running via sandbox.exec  │  │
│                 │◄────┤  │ stdout/stderr captured as output   │  │
│                 │     │  └────────────────────────────────────┘  │
│  Store result   │     │  sleepAfter: "15m" (auto-recycle)        │
└─────────────────┘     └──────────────────────────────────────────┘
```

## Proposed Changes

### Step 1 — Add `@cloudflare/sandbox` dependency and Dockerfile

**Install the SDK:**
```bash
bun add @cloudflare/sandbox
```

**Create `Dockerfile`** at repo root (required by Sandbox SDK):
```dockerfile
FROM docker.io/cloudflare/sandbox:latest
RUN npm install -g opencode
ENV COMMAND_TIMEOUT_MS=300000
EXPOSE 3000
```

This container image has OpenCode pre-installed, matching the pattern from the Claude Code example.

### Step 2 — Configure wrangler.json for Sandbox Durable Object

Add container and Durable Object configuration to `wrangler.json`:

```jsonc
{
  // ... existing config ...
  "containers": [
    {
      "class_name": "Sandbox",
      "image": "./Dockerfile",
      "instance_type": "basic",
      "max_instances": 10
    }
  ],
  "durable_objects": {
    "bindings": [
      {
        "name": "Sandbox",
        "class_name": "Sandbox"
      }
    ]
  },
  "migrations": [
    {
      "tag": "v1",
      "new_sqlite_classes": ["Sandbox"]
    }
  ]
}
```

### Step 3 — Export Sandbox class from worker entry (`worker/src/index.ts`)

The Sandbox SDK requires the worker to re-export the `Sandbox` class so Cloudflare can wire up the Durable Object:

```ts
// Add at the bottom of index.ts
export { Sandbox } from "@cloudflare/sandbox";
```

Also add the `Sandbox` binding to the `Bindings` type:

```ts
type Bindings = {
  // ... existing ...
  Sandbox: DurableObjectNamespace;
};
```

### Step 4 — Create sandbox helper module (`worker/src/lib/sandbox.ts`)

```ts
import { getSandbox } from "@cloudflare/sandbox";
import type { Sandbox } from "@cloudflare/sandbox";

const SANDBOX_SLEEP_AFTER = "15m";

export type SandboxEnv = {
  Sandbox: DurableObjectNamespace<Sandbox>;
  ANTHROPIC_API_KEY?: string;
};

/** Get or resume a sandbox for a given task. Uses taskId as sandbox ID for reuse. */
export function getTaskSandbox(env: SandboxEnv, taskId: string) {
  return getSandbox(env.Sandbox, taskId, {
    sleepAfter: SANDBOX_SLEEP_AFTER,
    normalizeId: true,
  });
}
```

Key design decisions:
- **`taskId` as sandbox ID** — ensures all runs for the same task share the same sandbox (reuse/resume).
- **`sleepAfter: "15m"`** — sandbox stays alive for 15 min after the last activity. While the user is actively chatting, the sandbox stays warm and subsequent messages are fast. After 15 min of inactivity, the container sleeps and is recycled on next use.
- **`normalizeId: true`** — future-proofs against the SDK's upcoming default of lowercase IDs.

### Step 5 — Update `executeTaskRun` (`worker/src/lib/task-runs.ts`)

Replace the external OpenCode HTTP call with sandbox-based execution:

```
Before:
  1. Mark run as "running"
  2. Reuse or create OpenCode session (external HTTP)
  3. Send message to OpenCode (external HTTP)
  4. Store response
  5. Mark run as "succeeded"

After:
  1. Mark run as "running"
  2. Get/resume sandbox via getTaskSandbox(env, taskId)
  3. Persist sandboxId on the task run row
  4. If first run for this task: clone repo into sandbox, set env vars
  5. Execute opencode command via sandbox.exec()
  6. Store response (stdout)
  7. Mark run as "succeeded"
```

Specific changes to `executeTaskRun`:
- Extend `TaskRunEnv` to include `SandboxEnv`.
- Call `getTaskSandbox(env, taskId)` to get/create the sandbox.
- Derive a stable `sandboxId` from the task ID and persist it on the `taskRuns` row immediately after creation.
- On first run: `sandbox.gitCheckout(repoUrl)` and `sandbox.setEnvVars(...)` to set up the environment.
- Execute: `sandbox.exec('opencode -p "..." --permission-mode acceptEdits')` (or equivalent CLI).
- Capture `stdout` as the assistant output, `stderr` for error detection.
- On success, optionally run `sandbox.exec('git diff')` to capture code changes.
- No explicit `destroy()` call — rely on `sleepAfter` TTL for cleanup.

### Step 6 — Update the run creation route (`worker/src/routes/tasks.ts`)

In `POST /api/tasks/:taskId/runs`:
- Pass `c.env` (which now includes the `Sandbox` binding) through to `executeTaskRun`.
- The `sandboxId` is derived from `taskId` inside `executeTaskRun`, so no changes to the request body.

The `sandboxId` stored on the task run row will be the task ID (since that's what we use as the sandbox identifier).

### Step 7 — Surface sandbox ID in the frontend

The `TaskRun` type in `frontend/src/lib/api.ts:99` already includes `sandboxId: string | null`. No type changes needed.

In `frontend/src/pages/task-page.tsx`, display the sandbox ID in the run status panel when non-null:

```tsx
{run.sandboxId && (
  <p className="text-xs text-muted-foreground">sandbox: {run.sandboxId}</p>
)}
```

### Step 8 — No migration needed

The `sandbox_id` column already exists in `task_runs` (migration `0007_task_runs.sql`). No schema changes required.

## Sandbox Lifecycle & Reuse

```
User sends message 1 (task T1)
  → getSandbox(env.Sandbox, "T1", { sleepAfter: "15m" })
  → Sandbox created (cold start ~2-3s)
  → Clone repo, set env vars
  → Run opencode → return response
  → sandboxId = "T1" stored on task_run row

User sends message 2 (task T1, within 15 min)
  → getSandbox(env.Sandbox, "T1", { sleepAfter: "15m" })
  → Same sandbox resumed instantly (warm)
  → Repo already cloned, env vars set
  → Run opencode → return response (fast!)
  → sandboxId = "T1" stored on task_run row

15 min pass with no activity...
  → Sandbox auto-sleeps (container recycled)

User sends message 3 (task T1, after sleep)
  → getSandbox(env.Sandbox, "T1", { sleepAfter: "15m" })
  → Fresh container starts (cold start)
  → Re-clone repo, re-set env vars
  → Run opencode → return response
```

## File Change Summary

| File | Change |
|------|--------|
| `package.json` | Add `@cloudflare/sandbox` dependency |
| `Dockerfile` | **New** — sandbox container image with OpenCode |
| `wrangler.json` | Add `containers`, `durable_objects`, `migrations` config |
| `worker/src/index.ts` | Export `Sandbox` class, add `Sandbox` to `Bindings` |
| `worker/src/lib/sandbox.ts` | **New** — `getTaskSandbox()` helper |
| `worker/src/lib/task-runs.ts` | Replace external OpenCode HTTP call with `sandbox.exec()` |
| `worker/src/routes/tasks.ts` | Pass `Sandbox` env binding to `executeTaskRun` |
| `frontend/src/pages/task-page.tsx` | Show `sandboxId` in run status panel |
| `worker/src/db/schema.ts` | No changes (column exists) |
| `frontend/src/lib/api.ts` | No changes (type exists) |
| `worker/src/lib/opencode.ts` | Keep as-is (may be useful as fallback or removed later) |

## Open Questions

1. **OpenCode CLI vs server mode** — The plan assumes OpenCode has a CLI mode similar to `claude -p "task"`. If OpenCode only supports HTTP API mode, we'd need to start it as a background process inside the sandbox and route requests to it via `sandbox.exec('curl ...')`. Need to confirm OpenCode's CLI capabilities.
2. **Repo URL source** — Tasks have an optional `projectId` referencing the `projects` table which has `repoUrl`. We should use this for `sandbox.gitCheckout()`. Need to handle the case where no project is attached to a task.
3. **Git credentials** — Private repos need auth for cloning. May need to pass a GitHub token via `sandbox.setEnvVars()`.
4. **`sleepAfter` tuning** — Starting with 15 min. May want to make this configurable per-org or globally via env var.
