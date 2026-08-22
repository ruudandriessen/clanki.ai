import { Command, InvalidArgumentError } from "commander";
import type { OutputFormat } from "../functions/analyze";

export interface AnalyzeCommandOptions {
  config: string;
  format: OutputFormat;
  project: string;
}

export async function parseAnalyzeCommandArgs(argv: string[]): Promise<AnalyzeCommandOptions> {
  const program = new Command()
    .name("clanki")
    .usage("[analyze] --project <path-to-tsconfig> [--config <path-to-clanki-config>] [options]")
    .description("Analyze a TypeScript project and emit a JSON report. (default command)")
    .showHelpAfterError()
    .helpOption("-h, --help", "Show this help message")
    .requiredOption("-p, --project <path-to-tsconfig>", "Path to the tsconfig.json to analyze")
    .option(
      "-c, --config <path-to-clanki-config>",
      "Path to a clanki.json architecture config (default: ./clanki.json)",
      "clanki.json",
    )
    .option("--format <format>", "Output format. Supported: json", parseOutputFormat, "json")
    .exitOverride();

  await program.parseAsync(argv, { from: "user" });

  const options = program.opts<AnalyzeCommandOptions>();

  return {
    config: options.config,
    format: options.format,
    project: options.project,
  };
}

function parseOutputFormat(value: string): OutputFormat {
  if (value !== "json") {
    throw new InvalidArgumentError(`Unsupported format: ${value}`);
  }

  return value;
}
