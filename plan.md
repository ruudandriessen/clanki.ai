# Plan: Run OpenCode in Cloudflare Sandbox with Task Run Association

## Context

The goal is to run OpenCode inside a [Cloudflare Sandbox](https://developers.cloudflare.com/sandbox/) and associate that sandbox with each task run. The `sandboxId` column already exists in the `task_runs` table (`schema.ts:341`) but is always set to `null` (`tasks.ts:297`).

The Cloudflare Sandbox SDK (`@cloudflare/sandbox`) provides container-backed Durable Objects with first-class OpenCode integration:

- **Prebuilt image**: `docker.io/cloudflare/sandbox:X.Y.Z-opencode` — has OpenCode CLI pre-installed.
- **SDK helpers**: `@cloudflare/sandbox/opencode` exports `createOpencode()` and `createOpencodeServer()`.
- **Typed client**: `@opencode-ai/sdk` provides a type-safe client for OpenCode's REST API.
- `getSandbox(env.Sandbox, id)` — gets or creates a sandbox by ID. **Same ID = same sandbox** (resume).
- `sleepAfter` option — auto-sleep after inactivity. After sleep, next request starts a fresh container.

There's an [official OpenCode + Sandbox example](https://github.com/cloudflare/sandbox-sdk/tree/main/examples/opencode) that demonstrates exactly this pattern.

## Current Flow

1. Frontend calls `POST /api/tasks/:taskId/runs` with a `messageId`
2. Worker creates a `taskRuns` row with `sandboxId: null`
3. Worker calls `executeTaskRun()` via `waitUntil`, which talks to an external OpenCode HTTP API
4. OpenCode runs outside of any sandbox — no isolation between tasks

## Proposed Architecture

Each **task** gets its own sandbox, identified by the task ID. OpenCode runs as a persistent server (`opencode serve`) inside the sandbox on port 4096. The worker talks to it using the `@opencode-ai/sdk` typed client via `createOpencode()`.

Subsequent runs for the same task reuse the same sandbox — the OpenCode server is already running, sessions are preserved, and the repo is already cloned. After a configurable idle TTL (15 min) with no new messages, the sandbox auto-sleeps.

```
┌─────────────────┐     ┌────────────────────────────────────────────┐
│  Worker (Hono)  │     │  Sandbox (container per task)               │
│                 │     │                                            │
│  POST /runs ────┼────►│  getSandbox(env.Sandbox, taskId)           │
│                 │     │  ┌──────────────────────────────────────┐  │
│  executeTaskRun │     │  │ opencode serve (port 4096)            │  │
│                 │     │  │ ├── session persists between runs     │  │
│  createOpencode ┼────►│  │ ├── /workspace/repo (cloned once)    │  │
│  client.session │     │  │ └── full filesystem access            │  │
│    .prompt()    │◄────┤  │                                      │  │
│                 │     │  └──────────────────────────────────────┘  │
│  Store result   │     │  sleepAfter: "15m" (auto-recycle)          │
└─────────────────┘     └────────────────────────────────────────────┘
```

### Why `opencode serve` (not one-shot CLI)?

- **Session persistence**: OpenCode sessions survive between runs within a warm sandbox. The agent retains conversation history, MCP server connections, and context.
- **No cold boot per message**: The server is already running; sending a message is just an HTTP call.
- **Existing code reuse**: The current `opencode.ts` HTTP client pattern maps directly to the `@opencode-ai/sdk` typed client.
- **The SDK supports it natively**: `createOpencode()` and `createOpencodeServer()` handle starting/connecting to the server.

## Proposed Changes

### Step 1 — Add dependencies and Dockerfile

**Install:**

```bash
bun add @cloudflare/sandbox @opencode-ai/sdk
```

**Create `Dockerfile`** at repo root:

```dockerfile
FROM docker.io/cloudflare/sandbox:0.7.2-opencode

# Clone target repo at sandbox creation time (overridden per-task via gitCheckout)
WORKDIR /home/user

# Expose OpenCode server port (required for wrangler dev)
EXPOSE 4096
```

The `-opencode` variant already has the OpenCode CLI installed at `/root/.opencode/bin`. No need to install it ourselves.

### Step 2 — Configure `wrangler.json` for Sandbox Durable Object

Add container, Durable Object, and migration config:

```jsonc
{
  // ... existing config ...
  "containers": [
    {
      "class_name": "Sandbox",
      "image": "./Dockerfile",
      "instance_type": "basic",
    },
  ],
  "durable_objects": {
    "bindings": [
      {
        "name": "Sandbox",
        "class_name": "Sandbox",
      },
    ],
  },
  "migrations": [
    {
      "tag": "v1",
      "new_sqlite_classes": ["Sandbox"],
    },
  ],
}
```

### Step 3 — Export Sandbox class and update bindings (`worker/src/index.ts`)

```ts
// Re-export Sandbox DO class (required by Cloudflare)
export { Sandbox } from "@cloudflare/sandbox";
```

Add to `Bindings` type:

```ts
type Bindings = {
  // ... existing ...
  Sandbox: DurableObjectNamespace;
  ANTHROPIC_API_KEY?: string; // for OpenCode inside sandbox
  GITHUB_APP_ID?: string; // for installation token generation
  GITHUB_APP_PRIVATE_KEY?: string; // for installation token generation
};
```

### Step 4 — Add GitHub App installation token helper (`worker/src/lib/github.ts`)

Currently the codebase uses user OAuth tokens for GitHub API calls (`installations.ts:27`). For cloning private repos into sandboxes, we need **installation access tokens** — short-lived tokens scoped to the GitHub App installation.

```ts
export async function createInstallationToken(
  env: { GITHUB_APP_ID?: string; GITHUB_APP_PRIVATE_KEY?: string },
  installationId: number,
): Promise<string>;
```

Flow:

1. Generate a JWT signed with the GitHub App private key (`GITHUB_APP_PRIVATE_KEY`).
2. Exchange it for an installation access token via `POST /app/installations/{installation_id}/access_tokens`.
3. Return the token (valid for ~1 hour).

This token is used to construct an authenticated clone URL: `https://x-access-token:{token}@github.com/{owner}/{repo}.git`

**New secrets** (set via `wrangler secret put`):

- `GITHUB_APP_ID` — the numeric GitHub App ID
- `GITHUB_APP_PRIVATE_KEY` — the PEM-encoded private key

### Step 5 — Create sandbox helper module (`worker/src/lib/sandbox.ts`)

```ts
import { getSandbox } from "@cloudflare/sandbox";
import { createOpencode } from "@cloudflare/sandbox/opencode";
import type { Sandbox } from "@cloudflare/sandbox";
import type { OpencodeClient } from "@opencode-ai/sdk";

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

/** Get a typed OpenCode SDK client connected to the sandbox's opencode server. */
export async function getOpenCodeClient(
  sandbox: ReturnType<typeof getSandbox>,
  env: SandboxEnv,
  directory: string,
) {
  return createOpencode<OpencodeClient>(sandbox, {
    directory,
    config: {
      provider: {
        anthropic: {
          options: { apiKey: env.ANTHROPIC_API_KEY ?? "" },
        },
      },
    },
  });
}
```

Key design decisions:

- **`taskId` as sandbox ID** — all runs for the same task share the same sandbox.
- **`sleepAfter: "15m"`** — sandbox stays warm while the user is chatting. After 15 min idle, auto-recycles.
- **`createOpencode()`** — starts `opencode serve` inside the sandbox (or connects to it if already running) and returns a typed SDK client.
- **`normalizeId: true`** — future-proofs for the SDK's upcoming lowercase-ID default.

### Step 6 — Rewrite `executeTaskRun` (`worker/src/lib/task-runs.ts`)

Replace the external OpenCode HTTP calls with sandbox-based execution:

```
Before:
  1. Mark run as "running"
  2. Reuse or create OpenCode session (external HTTP via opencode.ts)
  3. Send message to OpenCode (external HTTP)
  4. Store response
  5. Mark run as "succeeded"

After:
  1. Mark run as "running"
  2. Get/resume sandbox via getTaskSandbox(env, taskId)
  3. Persist sandboxId on the task run row
  4. If repo not yet cloned: generate installation token, gitCheckout with auth
  5. Get typed OpenCode client via getOpenCodeClient()
  6. Reuse or create OpenCode session (via SDK client)
  7. Send prompt via client.session.prompt()
  8. Extract text response, store as assistant message
  9. Mark run as "succeeded"
```

Specific changes:

- Extend `TaskRunEnv` to include `SandboxEnv` + GitHub App secrets.
- Add `repoUrl` and `installationId` to the `executeTaskRun` args (looked up from the task's project).
- After getting the sandbox, update the `taskRuns` row with `sandboxId = taskId`.
- Use `sandbox.gitCheckout(authenticatedRepoUrl)` for initial clone.
- Use the `@opencode-ai/sdk` client for session management (replacing `opencode.ts`):
  - `client.session.create({ body: { title }, query: { directory } })`
  - `client.session.prompt({ path: { id }, query: { directory }, body: { parts, model } })`
- Session reuse: query existing sessions via the SDK or store sessionId on the task run as today.

### Step 7 — Update the run creation route (`worker/src/routes/tasks.ts`)

In `POST /api/tasks/:taskId/runs`:

- Look up the task's project to get `repoUrl` and `installationId`.
- Pass these + `c.env` (including `Sandbox` binding) to `executeTaskRun`.

```ts
// Look up project for repo info
const project = task.projectId
  ? await db.query.projects.findFirst({
      where: eq(schema.projects.id, task.projectId),
      columns: { repoUrl: true, installationId: true },
    })
  : null;

c.executionCtx.waitUntil(
  executeTaskRun({
    db: drizzle(c.env.DB, { schema }),
    env: c.env,
    runId: run.id,
    taskId,
    taskTitle: task.title,
    prompt: inputMessage.content,
    repoUrl: project?.repoUrl ?? null,
    installationId: project?.installationId ?? null,
  }),
);
```

### Step 8 — Surface sandbox ID in the frontend

The `TaskRun` type in `frontend/src/lib/api.ts:99` already includes `sandboxId: string | null`. No type changes needed.

In `frontend/src/pages/task-page.tsx`, display the sandbox ID in the run status panel:

```tsx
{
  run.sandboxId && <p className="text-xs text-muted-foreground">sandbox: {run.sandboxId}</p>;
}
```

### Step 9 — No migration needed

The `sandbox_id` column already exists in `task_runs` (migration `0007_task_runs.sql`). No schema changes required.

## Sandbox Lifecycle & Reuse

```
User sends message 1 (task T1)
  → getSandbox(env.Sandbox, "T1", { sleepAfter: "15m" })
  → Sandbox created (cold start ~2-3s)
  → Generate installation token, gitCheckout(authRepoUrl)
  → createOpencode() starts `opencode serve` on :4096
  → client.session.create() → client.session.prompt()
  → sandboxId = "T1" stored on task_run row

User sends message 2 (task T1, within 15 min)
  → getSandbox(env.Sandbox, "T1", { sleepAfter: "15m" })
  → Same sandbox, opencode server already running (warm!)
  → Repo already cloned, session already exists
  → client.session.prompt() → instant response
  → sandboxId = "T1" stored on task_run row

15 min pass with no activity...
  → Sandbox auto-sleeps (container recycled)

User sends message 3 (task T1, after sleep)
  → getSandbox(env.Sandbox, "T1", { sleepAfter: "15m" })
  → Fresh container starts (cold start)
  → Re-generate installation token, re-clone repo
  → createOpencode() restarts server, new session
  → client.session.prompt()
```

## File Change Summary

| File                               | Change                                                         |
| ---------------------------------- | -------------------------------------------------------------- |
| `package.json`                     | Add `@cloudflare/sandbox`, `@opencode-ai/sdk`                  |
| `Dockerfile`                       | **New** — uses `cloudflare/sandbox:X.Y.Z-opencode` base image  |
| `wrangler.json`                    | Add `containers`, `durable_objects`, `migrations`              |
| `worker/src/index.ts`              | Export `Sandbox` class, add `Sandbox` + API key bindings       |
| `worker/src/lib/github.ts`         | **New** — `createInstallationToken()` for private repo cloning |
| `worker/src/lib/sandbox.ts`        | **New** — `getTaskSandbox()`, `getOpenCodeClient()`            |
| `worker/src/lib/task-runs.ts`      | Rewrite to use sandbox + `@opencode-ai/sdk` client             |
| `worker/src/routes/tasks.ts`       | Look up project repo info, pass to `executeTaskRun`            |
| `frontend/src/pages/task-page.tsx` | Show `sandboxId` in run status panel                           |
| `worker/src/db/schema.ts`          | No changes (column exists)                                     |
| `frontend/src/lib/api.ts`          | No changes (type exists)                                       |
| `worker/src/lib/opencode.ts`       | Can be removed once migration is complete                      |

## New Secrets Required

Set via `wrangler secret put`:

- `ANTHROPIC_API_KEY` — for OpenCode inside the sandbox to call Anthropic
- `GITHUB_APP_ID` — GitHub App numeric ID (for installation token generation)
- `GITHUB_APP_PRIVATE_KEY` — GitHub App PEM private key (for installation token generation)
