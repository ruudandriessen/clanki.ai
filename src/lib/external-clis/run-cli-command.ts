import { spawnSync } from "node:child_process";

type CliCommandResult = {
  error: NodeJS.ErrnoException | null;
  status: number | null;
  stderr: string;
  stdout: string;
};

export function runCliCommand(program: string, args: string[]): CliCommandResult {
  const result = spawnSync(program, args, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });

  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status,
    error: result.error ?? null,
  };
}

export function isCliNotInstalled(error: NodeJS.ErrnoException | null): boolean {
  return error !== null && "code" in error && error.code === "ENOENT";
}
