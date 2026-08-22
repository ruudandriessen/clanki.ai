import { spawnSync } from "node:child_process";

function runGh(args: string[]): string {
  const result = spawnSync("gh", args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });

  if (result.error) {
    if ("code" in result.error && result.error.code === "ENOENT") {
      throw new Error("gh is not installed or not on PATH");
    }

    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = result.stderr.trim();
    throw new Error(stderr.length > 0 ? stderr : `gh ${args.join(" ")} failed`);
  }

  return result.stdout;
}

export function runGhJson<T>(args: string[]): T {
  const stdout = runGh(args).trim();
  if (stdout.length === 0) {
    throw new Error(`gh ${args.join(" ")} returned no JSON`);
  }

  return JSON.parse(stdout) as T;
}
