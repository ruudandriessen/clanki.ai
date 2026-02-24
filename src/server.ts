import handler from "@tanstack/react-start/server-entry";

// Re-export Durable Object classes so Cloudflare can instantiate them
export { Sandbox } from "@cloudflare/sandbox";
export { TaskRunner } from "./server/lib/task-runner";

export default {
  fetch: handler.fetch,
};
