import { spawnSync } from "node:child_process";

export function readWorkspaceBranch(directory: string): string | null {
  const output = spawnSync("git", ["-C", directory, "rev-parse", "--abbrev-ref", "HEAD"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (output.status !== 0) {
    return null;
  }

  const branch = output.stdout.trim();
  return branch.length > 0 ? branch : null;
}
