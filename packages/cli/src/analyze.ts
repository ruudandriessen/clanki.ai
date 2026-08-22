import { analyzeProject, type DependencyGraph } from "./analysis-engine";

export interface AnalyzeOptions {
  project: string;
}

export interface AnalyzeResult {
  graph: DependencyGraph;
  output: string;
}

export function analyze(options: AnalyzeOptions): AnalyzeResult {
  const graph = analyzeProject(options.project);

  return {
    graph,
    output: `${JSON.stringify(graph, null, 2)}\n`,
  };
}
