import type { ModelSummary, SourceFileDependencySummary } from "../functions/run/models/report";
import type {
  ProjectAnalysisGraph,
  ProjectAnalysisGraphEdge,
  ProjectAnalysisGraphNode,
} from "./types";

export function buildAnalysisGraph(
  sourceFiles: string[],
  models: ModelSummary[],
  sourceFileDependencies: SourceFileDependencySummary[],
): ProjectAnalysisGraph {
  const nodesById = new Map<string, ProjectAnalysisGraphNode>();
  const edgesByKey = new Map<string, ProjectAnalysisGraphEdge>();

  for (const sourceFile of sourceFiles) {
    nodesById.set(sourceFile, {
      id: sourceFile,
      type: "source-file",
      label: sourceFile,
      sourceFile,
    });
  }

  for (const model of models) {
    nodesById.set(model.id, {
      id: model.id,
      type: "model",
      label: model.name,
      sourceFile: model.location.file,
    });

    addEdge(edgesByKey, {
      from: model.location.file,
      to: model.id,
      type: "defines-model",
    });
  }

  for (const dependency of sourceFileDependencies) {
    addEdge(edgesByKey, {
      from: dependency.fromFile,
      to: dependency.toFile,
      type: "imports",
    });
  }

  const modelsByName = new Map<string, ModelSummary[]>();

  for (const model of models) {
    const existingModels = modelsByName.get(model.name);

    if (existingModels) {
      existingModels.push(model);
      continue;
    }

    modelsByName.set(model.name, [model]);
  }

  for (const model of models) {
    for (const referencedTypeName of model.referencedTypeNames) {
      for (const referencedModel of resolveReferencedModels(referencedTypeName, modelsByName)) {
        if (model.id === referencedModel.id) {
          continue;
        }

        addEdge(edgesByKey, {
          from: model.id,
          to: referencedModel.id,
          type: "references-type",
        });
      }
    }
  }

  return {
    nodes: Array.from(nodesById.values()).toSorted(compareGraphNodes),
    edges: Array.from(edgesByKey.values()).toSorted(compareGraphEdges),
  };
}

function addEdge(map: Map<string, ProjectAnalysisGraphEdge>, edge: ProjectAnalysisGraphEdge): void {
  map.set(getGraphEdgeKey(edge), edge);
}

function getGraphEdgeKey(edge: ProjectAnalysisGraphEdge): string {
  return `${edge.type}\0${edge.from}\0${edge.to}`;
}

function compareGraphNodes(
  left: ProjectAnalysisGraphNode,
  right: ProjectAnalysisGraphNode,
): number {
  return (
    left.type.localeCompare(right.type) ||
    left.sourceFile.localeCompare(right.sourceFile) ||
    left.label.localeCompare(right.label) ||
    left.id.localeCompare(right.id)
  );
}

function compareGraphEdges(
  left: ProjectAnalysisGraphEdge,
  right: ProjectAnalysisGraphEdge,
): number {
  return (
    left.type.localeCompare(right.type) ||
    left.from.localeCompare(right.from) ||
    left.to.localeCompare(right.to)
  );
}

function resolveReferencedModels(
  referencedTypeName: string,
  modelsByName: Map<string, ModelSummary[]>,
): ModelSummary[] {
  const exactMatches = modelsByName.get(referencedTypeName);

  if (exactMatches && exactMatches.length > 0) {
    return exactMatches;
  }

  const lastSeparator = referencedTypeName.lastIndexOf(".");

  if (lastSeparator === -1 || lastSeparator === referencedTypeName.length - 1) {
    return [];
  }

  const simpleName = referencedTypeName.slice(lastSeparator + 1);
  return modelsByName.get(simpleName) ?? [];
}
