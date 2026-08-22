import { CommanderError } from "commander";

import { parseAnalyzeCommandArgs } from "./commands/analyze";
import { parseCheckCommandArgs } from "./commands/check";
import { parseRunCommandArgs } from "./commands/run";
import { analyze } from "./functions/analyze";
import { check } from "./functions/check";
import { run } from "./functions/run";

export async function runCli(argv: string[]): Promise<number> {
  try {
    const [command, ...restArgs] = argv;

    if (command === "check") {
      const options = await parseCheckCommandArgs(restArgs);
      const result = await check(options);
      const stream = result.exitCode === 0 ? process.stdout : process.stderr;

      stream.write(result.output);
      return result.exitCode;
    }

    if (command === "run") {
      const options = await parseRunCommandArgs(restArgs);
      await run(options);
      return 0;
    }

    const options = await parseAnalyzeCommandArgs(command === "analyze" ? restArgs : argv);
    const result = await analyze(options);

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
