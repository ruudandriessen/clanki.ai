import { Command, InvalidArgumentError } from "commander";

export interface RunCommandOptions {
  config: string;
  host: string;
  open: boolean;
  port: number;
  project: string;
  webDist?: string;
}

export async function parseRunCommandArgs(argv: string[]): Promise<RunCommandOptions> {
  const program = new Command()
    .name("clanki run")
    .usage("--project <path-to-tsconfig> [--config <path-to-clanki-config>] [options]")
    .description("Start the interactive architecture UI with local config/report APIs.")
    .showHelpAfterError()
    .helpOption("-h, --help", "Show this help message")
    .requiredOption("-p, --project <path-to-tsconfig>", "Path to the tsconfig.json to analyze")
    .option(
      "-c, --config <path-to-clanki-config>",
      "Path to a clanki.json architecture config (default: ./clanki.json)",
      "clanki.json",
    )
    .option("--host <host>", "Host for the local UI server", "127.0.0.1")
    .option("--port <port>", "Port for the local UI server", parsePort, 4177)
    .option(
      "--web-dist <path>",
      "Path to built web assets (directory containing index.html). Falls back to CLANKI_WEB_DIST or bundled assets.",
    )
    .option("--no-open", "Do not open the browser automatically")
    .exitOverride();

  await program.parseAsync(argv, { from: "user" });

  const options = program.opts<RunCommandOptions>();

  return {
    config: options.config,
    host: options.host,
    open: options.open,
    port: options.port,
    project: options.project,
    webDist: options.webDist,
  };
}

function parsePort(value: string): number {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65_535) {
    throw new InvalidArgumentError("Port must be an integer between 1 and 65535");
  }

  return parsed;
}
