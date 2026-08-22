import { collectSourceFileDependencies } from "./analysis-engine/dependency-extractor";
import { loadTypeScriptProgram } from "./analysis-engine/program-loader";
import { collectProjectSourceFiles } from "./analysis-engine/source-files";
import type { DependencyGraph } from "./analysis-engine/types";

export type { DependencyGraph, SourceFileDependency } from "./analysis-engine/types";

export function analyzeProject(projectPath: string): DependencyGraph {
  const { resolvedTsconfigPath, projectDirectory, parsedConfig, program } =
    loadTypeScriptProgram(projectPath);

  return {
    tsconfigPath: resolvedTsconfigPath,
    projectDirectory,
    files: collectProjectSourceFiles(program, projectDirectory),
    edges: collectSourceFileDependencies(program, projectDirectory, parsedConfig.options),
  };
}
