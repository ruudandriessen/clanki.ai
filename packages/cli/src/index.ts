import { CommanderError } from "commander";

import { parseAnalyzeCommandArgs } from "./commands/analyze";
import { analyze } from "./analyze";

export async function runCli(argv: string[]): Promise<number> {
  try {
    const [command, ...restArgs] = argv;
    const options = await parseAnalyzeCommandArgs(command === "analyze" ? restArgs : argv);
    const result = analyze(options);

    process.stdout.write(result.output);
    return 0;
  } catch (error) {
    if (error instanceof CommanderError) {
      return error.exitCode;
    }

    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    return 1;
  }
}
