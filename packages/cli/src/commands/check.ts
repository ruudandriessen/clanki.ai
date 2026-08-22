import { Command } from "commander";

export interface CheckCommandOptions {
  config: string;
  project: string;
}

export async function parseCheckCommandArgs(argv: string[]): Promise<CheckCommandOptions> {
  const program = new Command()
    .name("clanki check")
    .usage("--project <path-to-tsconfig> [--config <path-to-clanki-config>]")
    .description("Run strict and rule checks, and exit non-zero on violations.")
    .showHelpAfterError()
    .helpOption("-h, --help", "Show this help message")
    .requiredOption("-p, --project <path-to-tsconfig>", "Path to the tsconfig.json to analyze")
    .option(
      "-c, --config <path-to-clanki-config>",
      "Path to a clanki.json architecture config (default: ./clanki.json)",
      "clanki.json",
    )
    .exitOverride();

  await program.parseAsync(argv, { from: "user" });

  const options = program.opts<CheckCommandOptions>();

  return {
    config: options.config,
    project: options.project,
  };
}
