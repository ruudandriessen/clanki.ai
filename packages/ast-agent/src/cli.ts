import {
  type CreateAgentSessionRuntimeFactory,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
  InteractiveMode,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

import { parseAstAgentArgs, resolveTsconfigPath } from "./args";
import { AST_AGENT_SYSTEM_PROMPT } from "./system-prompt";
import { createAstTools } from "./tools";
import { createTypeScriptIndex } from "./typescript-index";

const HELP = `clanki-ast [--project <tsconfig>] [prompt...]

TypeScript AST-tool TUI on top of pi. File-read tools are disabled.
`;

export async function runAstAgent(argv: string[]): Promise<number> {
  const options = parseAstAgentArgs(argv);

  if (options.help) {
    process.stdout.write(HELP);
    return 0;
  }

  let index: ReturnType<typeof createTypeScriptIndex> | undefined;

  try {
    const tsconfigPath = resolveTsconfigPath(options.project);
    index = createTypeScriptIndex(tsconfigPath);
    const customTools = createAstTools(index);
    const createRuntime: CreateAgentSessionRuntimeFactory = async ({
      cwd,
      agentDir,
      sessionManager,
      sessionStartEvent,
    }) => {
      const services = await createAgentSessionServices({
        cwd,
        agentDir,
        resourceLoaderOptions: {
          noExtensions: true,
          appendSystemPrompt: [AST_AGENT_SYSTEM_PROMPT],
        },
      });

      return {
        ...(await createAgentSessionFromServices({
          services,
          sessionManager,
          sessionStartEvent,
          noTools: "builtin",
          customTools,
        })),
        services,
        diagnostics: services.diagnostics,
      };
    };

    const runtime = await createAgentSessionRuntime(createRuntime, {
      cwd: process.cwd(),
      agentDir: getAgentDir(),
      sessionManager: SessionManager.create(process.cwd()),
    });
    const mode = new InteractiveMode(runtime, {
      migratedProviders: [],
      startupDiagnostics: [...runtime.diagnostics],
      modelFallbackMessage: runtime.modelFallbackMessage,
      ...(options.prompt ? { initialMessage: options.prompt } : {}),
    });

    await mode.run();
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    return 1;
  } finally {
    index?.dispose();
  }
}
