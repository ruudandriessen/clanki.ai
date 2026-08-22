export { analyze, type AnalyzeOptions, type AnalyzeResult } from "./src/analyze";
export {
  analyzeProject,
  type DependencyGraph,
  type SourceFileDependency,
} from "./src/analysis-engine";
export {
  countDependencyGraphChanges,
  diffDependencyGraphs,
  selectChangedDependencyGraph,
  type DependencyGraphDiff,
  type DependencyGraphDiffCounts,
  type DependencyGraphEdgeChange,
  type DependencyGraphEdgeStatus,
  type DependencyGraphFileChange,
  type DependencyGraphFileStatus,
} from "./src/diff-graphs";
export { runCli } from "./src/index";
