import { collectDiagnostics } from "./analysis-engine/diagnostic-extractor";
import { collectSourceFileDependencies } from "./analysis-engine/dependency-extractor";
import { buildAnalysisGraph } from "./analysis-engine/graph-builder";
import { collectModels } from "./analysis-engine/model-extractor";
import { buildProjectSummary } from "./analysis-engine/project-summary-builder";
import { loadTypeScriptProgram } from "./analysis-engine/program-loader";

import type { ProjectAnalysisResult } from "./analysis-engine/types";
export type { ProjectAnalysisResult };

export function analyzeProject(projectPath: string): ProjectAnalysisResult {
  const { resolvedTsconfigPath, projectDirectory, parsedConfig, program } =
    loadTypeScriptProgram(projectPath);

  const models = collectModels(program, projectDirectory);
  const project = buildProjectSummary(
    resolvedTsconfigPath,
    projectDirectory,
    parsedConfig.fileNames,
    parsedConfig.options,
  );
  const sourceFileDependencies = collectSourceFileDependencies(
    program,
    projectDirectory,
    parsedConfig.options,
  );

  return {
    project,
    diagnostics: collectDiagnostics(program, parsedConfig.errors, projectDirectory),
    models,
    sourceFileDependencies,
    graph: buildAnalysisGraph(project.sourceFiles, models, sourceFileDependencies),
  };
}
