import { Command } from "commander";

export interface AnalyzeCommandOptions {
  project: string;
}

export async function parseAnalyzeCommandArgs(argv: string[]): Promise<AnalyzeCommandOptions> {
  const program = new Command()
    .name("clanki")
    .usage("[analyze] --project <path-to-tsconfig>")
    .description("Extract a TypeScript source-file dependency graph.")
    .showHelpAfterError()
    .helpOption("-h, --help", "Show this help message")
    .requiredOption("-p, --project <path-to-tsconfig>", "Path to the tsconfig.json to analyze")
    .exitOverride();

  await program.parseAsync(argv, { from: "user" });

  return {
    project: program.opts<AnalyzeCommandOptions>().project,
  };
}
