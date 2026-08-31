import { existsSync, statSync } from "node:fs";
import path from "node:path";

export function parseAstAgentArgs(argv: string[]): {
  help: boolean;
  project: string | undefined;
  prompt: string | undefined;
} {
  let project: string | undefined;
  const rest: string[] = [];
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }

    if ((arg === "--project" || arg === "-p") && argv[index + 1]) {
      project = argv[index + 1];
      index += 1;
      continue;
    }

    rest.push(arg ?? "");
  }

  return {
    help,
    project,
    prompt: rest.length > 0 ? rest.join(" ") : undefined,
  };
}

export function resolveTsconfigPath(project: string | undefined, cwd = process.cwd()): string {
  const candidate = project
    ? path.isAbsolute(project)
      ? project
      : path.resolve(cwd, project)
    : path.resolve(cwd, "tsconfig.json");
  const tsconfigPath =
    existsSync(candidate) && statSync(candidate).isDirectory()
      ? path.join(candidate, "tsconfig.json")
      : candidate;

  if (!existsSync(tsconfigPath)) {
    throw new Error(`No tsconfig.json found at ${tsconfigPath}`);
  }

  return tsconfigPath;
}
