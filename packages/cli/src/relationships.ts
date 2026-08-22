import { addSetEntry, resolveReferencedModels } from "./core";
import type {
  GroupSummary,
  ModelSummary,
  SourceFileDependencySummary,
  RelationshipSummary,
  ModuleGroupSummary,
  DataStructureGroupSummary,
} from "./functions/run/models/report";

export function resolveGroupRelationships(
  groups: GroupSummary[],
  models: ModelSummary[],
  sourceFileDependencies: SourceFileDependencySummary[],
): RelationshipSummary[] {
  const relationshipsByKey = new Map<string, RelationshipSummary>();
  const moduleGroupNamesBySourceFile = collectModuleGroupNamesBySourceFile(groups);
  const dataStructureGroupNamesByModelId = collectDataStructureGroupNamesByModelId(groups);

  addModuleGroupRelationships(
    moduleGroupNamesBySourceFile,
    sourceFileDependencies,
    relationshipsByKey,
  );
  addDataStructureGroupRelationships(dataStructureGroupNamesByModelId, models, relationshipsByKey);
  addModuleToDataStructureGroupRelationships(
    moduleGroupNamesBySourceFile,
    dataStructureGroupNamesByModelId,
    models,
    relationshipsByKey,
  );

  return Array.from(relationshipsByKey.values()).toSorted(compareRelationships);
}

function addModuleGroupRelationships(
  moduleGroupNamesBySourceFile: Map<string, Set<string>>,
  sourceFileDependencies: SourceFileDependencySummary[],
  relationshipsByKey: Map<string, RelationshipSummary>,
): void {
  for (const dependency of sourceFileDependencies) {
    const fromGroupNames = moduleGroupNamesBySourceFile.get(dependency.fromFile);
    const toGroupNames = moduleGroupNamesBySourceFile.get(dependency.toFile);

    if (!fromGroupNames || !toGroupNames) {
      continue;
    }

    for (const fromGroupName of fromGroupNames) {
      for (const toGroupName of toGroupNames) {
        if (fromGroupName === toGroupName) {
          continue;
        }

        addRelationship(relationshipsByKey, {
          from: fromGroupName,
          to: toGroupName,
          type: "imports",
        });
      }
    }
  }
}

function addDataStructureGroupRelationships(
  dataStructureGroupNamesByModelId: Map<string, Set<string>>,
  models: ModelSummary[],
  relationshipsByKey: Map<string, RelationshipSummary>,
): void {
  const modelsByName = new Map<string, ModelSummary[]>();

  for (const model of models) {
    const existingByName = modelsByName.get(model.name);

    if (existingByName) {
      existingByName.push(model);
    } else {
      modelsByName.set(model.name, [model]);
    }
  }

  for (const model of models) {
    const fromGroupNames = dataStructureGroupNamesByModelId.get(model.id);

    if (!fromGroupNames) {
      continue;
    }

    for (const referencedTypeName of model.referencedTypeNames) {
      const referencedModels = resolveReferencedModels(referencedTypeName, modelsByName);

      for (const referencedModel of referencedModels) {
        if (referencedModel.id === model.id) {
          continue;
        }

        const toGroupNames = dataStructureGroupNamesByModelId.get(referencedModel.id);

        if (!toGroupNames) {
          continue;
        }

        for (const fromGroupName of fromGroupNames) {
          for (const toGroupName of toGroupNames) {
            if (fromGroupName === toGroupName) {
              continue;
            }

            addRelationship(relationshipsByKey, {
              from: fromGroupName,
              to: toGroupName,
              type: "references-type",
            });
          }
        }
      }
    }
  }
}

function addModuleToDataStructureGroupRelationships(
  moduleGroupNamesBySourceFile: Map<string, Set<string>>,
  dataStructureGroupNamesByModelId: Map<string, Set<string>>,
  models: ModelSummary[],
  relationshipsByKey: Map<string, RelationshipSummary>,
): void {
  const dataStructureGroupNamesBySourceFile = new Map<string, Set<string>>();

  for (const model of models) {
    const dataStructureGroupNames = dataStructureGroupNamesByModelId.get(model.id);

    if (!dataStructureGroupNames) {
      continue;
    }

    for (const dataStructureGroupName of dataStructureGroupNames) {
      addSetEntry(dataStructureGroupNamesBySourceFile, model.location.file, dataStructureGroupName);
    }
  }

  for (const [sourceFile, moduleGroupNames] of moduleGroupNamesBySourceFile) {
    const dataStructureGroupNames = dataStructureGroupNamesBySourceFile.get(sourceFile);

    if (!dataStructureGroupNames) {
      continue;
    }

    for (const moduleGroupName of moduleGroupNames) {
      for (const dataStructureGroupName of dataStructureGroupNames) {
        if (moduleGroupName === dataStructureGroupName) {
          continue;
        }

        addRelationship(relationshipsByKey, {
          from: moduleGroupName,
          to: dataStructureGroupName,
          type: "defines-model",
        });
      }
    }
  }
}

function collectModuleGroupNamesBySourceFile(groups: GroupSummary[]): Map<string, Set<string>> {
  const moduleGroupNamesBySourceFile = new Map<string, Set<string>>();

  for (const group of groups.filter(isModuleGroup)) {
    for (const member of group.matchedMembers) {
      addSetEntry(moduleGroupNamesBySourceFile, member.path, group.id);
    }
  }

  return moduleGroupNamesBySourceFile;
}

function collectDataStructureGroupNamesByModelId(groups: GroupSummary[]): Map<string, Set<string>> {
  const dataStructureGroupNamesByModelId = new Map<string, Set<string>>();

  for (const group of groups.filter(isDataStructureGroup)) {
    for (const member of group.matchedMembers) {
      addSetEntry(dataStructureGroupNamesByModelId, member.id, group.id);
    }
  }

  return dataStructureGroupNamesByModelId;
}

function isModuleGroup(group: GroupSummary): group is ModuleGroupSummary {
  return group.type === "module";
}

function isDataStructureGroup(group: GroupSummary): group is DataStructureGroupSummary {
  return group.type === "data-structure";
}

function addRelationship(
  relationshipsByKey: Map<string, RelationshipSummary>,
  relationship: RelationshipSummary,
): void {
  relationshipsByKey.set(getRelationshipKey(relationship), relationship);
}

function getRelationshipKey(relationship: RelationshipSummary): string {
  return `${relationship.type}\0${relationship.from}\0${relationship.to}`;
}

function compareRelationships(left: RelationshipSummary, right: RelationshipSummary): number {
  return (
    left.type.localeCompare(right.type) ||
    left.from.localeCompare(right.from) ||
    left.to.localeCompare(right.to)
  );
}
