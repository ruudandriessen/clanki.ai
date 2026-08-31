import { runAstAgent } from "./src/cli";

const exitCode = await runAstAgent(process.argv.slice(2));
process.exit(exitCode);
