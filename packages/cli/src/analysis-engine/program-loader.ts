import path from "node:path";
import ts from "typescript";

export interface LoadedTypeScriptProgram {
  resolvedTsconfigPath: string;
  projectDirectory: string;
  parsedConfig: ts.ParsedCommandLine;
  program: ts.Program;
}

export function loadTypeScriptProgram(projectPath: string): LoadedTypeScriptProgram {
  const resolvedTsconfigPath = path.resolve(projectPath);
  const projectDirectory = path.dirname(resolvedTsconfigPath);
  const configResult = ts.readConfigFile(resolvedTsconfigPath, (fileName) =>
    ts.sys.readFile(fileName),
  );

  if (configResult.error) {
    throw new Error(formatConfigLoadError(resolvedTsconfigPath, configResult.error));
  }

  const parsedConfig = ts.parseJsonConfigFileContent(
    configResult.config,
    ts.sys,
    projectDirectory,
    undefined,
    resolvedTsconfigPath,
  );

  const program = ts.createProgram({
    rootNames: parsedConfig.fileNames,
    options: parsedConfig.options,
    projectReferences: parsedConfig.projectReferences,
  });

  return {
    resolvedTsconfigPath,
    projectDirectory,
    parsedConfig,
    program,
  };
}

function formatConfigLoadError(tsconfigPath: string, diagnostic: ts.Diagnostic): string {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
  return `Failed to load ${tsconfigPath}: ${message}`;
}
