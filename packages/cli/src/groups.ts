import path from "node:path";
import { Minimatch } from "minimatch";

import { addSetEntry, compareModelsByLocation, normalizePath } from "./core";
import type {
  ModelSummary,
  GroupSummary,
  ModuleGroupSummary,
  UnmatchedGroupMemberSummary,
  SourceFileGroupMemberSummary,
  DataStructureGroupSummary,
  ModelGroupMemberSummary,
} from "./functions/run/models/report";
import type {
  ClankiConfig,
  Group,
  ModuleGroup,
  DataStructureGroup,
  TypeReference,
} from "./model/config";

export function resolveGroups(
  config: ClankiConfig,
  configPath: string,
  projectDirectory: string,
  sourceFiles: string[],
  models: ModelSummary[],
): GroupSummary[] {
  const resolvedConfigPath = path.resolve(configPath);
  const configDirectory = path.dirname(resolvedConfigPath);

  return config.groups.map((group) =>
    resolveGroup(group, configDirectory, projectDirectory, sourceFiles, models),
  );
}

function resolveGroup(
  group: Group,
  configDirectory: string,
  projectDirectory: string,
  sourceFiles: string[],
  models: ModelSummary[],
): GroupSummary {
  if (group.type === "module") {
    return resolveModuleGroup(group, configDirectory, projectDirectory, sourceFiles);
  }

  return resolveDataStructureGroup(group, configDirectory, projectDirectory, models);
}

function resolveModuleGroup(
  group: ModuleGroup,
  configDirectory: string,
  projectDirectory: string,
  sourceFiles: string[],
): ModuleGroupSummary {
  const matchedBySourceFile = new Map<string, Set<string>>();
  const compiledIncludePatterns = group.include.map(compileIncludePattern);
  const matchableSourceFiles = sourceFiles.map((sourceFile) => ({
    configRelativePath: toConfigRelativePath(
      path.resolve(projectDirectory, sourceFile),
      configDirectory,
    ),
    projectRelativePath: normalizePath(sourceFile),
  }));
  const unmatchedMembers: UnmatchedGroupMemberSummary[] = [];

  for (const includePattern of compiledIncludePatterns) {
    let matched = false;

    for (const sourceFile of matchableSourceFiles) {
      if (!includePattern.matcher.match(sourceFile.configRelativePath)) {
        continue;
      }

      matched = true;
      addSetEntry(matchedBySourceFile, sourceFile.projectRelativePath, includePattern.pattern);
    }

    if (!matched) {
      unmatchedMembers.push({
        kind: "include-pattern",
        value: includePattern.pattern,
      });
    }
  }

  const matchedMembers = Array.from(matchedBySourceFile.entries())
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map<SourceFileGroupMemberSummary>(([filePath, patterns]) => ({
      kind: "source-file",
      path: filePath,
      matchedBy: Array.from(patterns).toSorted((left, right) => left.localeCompare(right)),
    }));

  return {
    id: group.id,
    name: group.name,
    type: group.type,
    position: group.position,
    width: group.width,
    height: group.height,
    matchedMembers,
    unmatchedMembers,
  };
}

function resolveDataStructureGroup(
  group: DataStructureGroup,
  configDirectory: string,
  projectDirectory: string,
  models: ModelSummary[],
): DataStructureGroupSummary {
  const matchedByModelId = new Map<
    string,
    { model: ModelSummary; matchedBy: Set<string>; configuredNames: Set<string> }
  >();
  const modelsByName = new Map<string, ModelSummary[]>();
  const modelsByQualifiedRef = new Map<string, ModelSummary>();
  const unmatchedMembers: UnmatchedGroupMemberSummary[] = [];

  for (const model of models) {
    const nameMatches = modelsByName.get(model.name);

    if (nameMatches) {
      nameMatches.push(model);
    } else {
      modelsByName.set(model.name, [model]);
    }

    const qualifiedFile = toConfigRelativePath(
      path.resolve(projectDirectory, model.location.file),
      configDirectory,
    );
    modelsByQualifiedRef.set(getQualifiedModelKey(model.name, qualifiedFile), model);
  }

  for (const typeReference of group.types) {
    const matchedModels = resolveTypeReference(typeReference, modelsByName, modelsByQualifiedRef);
    const formattedTypeReference = formatTypeReference(typeReference);
    const configuredName = typeReference.name;

    if (matchedModels.length === 0) {
      unmatchedMembers.push({
        kind: "type-reference",
        value: formattedTypeReference,
      });
      continue;
    }

    for (const model of matchedModels) {
      const existingEntry = matchedByModelId.get(model.id);

      if (existingEntry) {
        existingEntry.matchedBy.add(formattedTypeReference);
        if (configuredName !== undefined) {
          existingEntry.configuredNames.add(configuredName);
        }
        continue;
      }

      matchedByModelId.set(model.id, {
        model,
        matchedBy: new Set([formattedTypeReference]),
        configuredNames: new Set(configuredName === undefined ? [] : [configuredName]),
      });
    }
  }

  const matchedMembers = Array.from(matchedByModelId.values())
    .toSorted((left, right) => compareModelsByLocation(left.model, right.model))
    .map<ModelGroupMemberSummary>(({ model, matchedBy, configuredNames }) => {
      const configuredName = pickConfiguredName(model.name, configuredNames);

      return {
        kind: "model",
        id: model.id,
        name: configuredName ?? model.name,
        file: model.location.file,
        matchedBy: Array.from(matchedBy).toSorted((left, right) => left.localeCompare(right)),
        sourceText: model.sourceText,
      };
    });

  return {
    id: group.id,
    name: group.name,
    type: group.type,
    width: group.width,
    height: group.height,
    position: group.position,
    matchedMembers,
    unmatchedMembers,
  };
}

function resolveTypeReference(
  typeReference: TypeReference,
  modelsByName: Map<string, ModelSummary[]>,
  modelsByQualifiedRef: Map<string, ModelSummary>,
): ModelSummary[] {
  const qualifiedFile = typeReference.file;
  if (qualifiedFile === undefined) {
    return modelsByName.get(typeReference.id) ?? [];
  }

  return resolveQualifiedTypeReference(typeReference.id, qualifiedFile, modelsByQualifiedRef);
}

function resolveQualifiedTypeReference(
  id: string,
  file: string,
  modelsByQualifiedRef: Map<string, ModelSummary>,
): ModelSummary[] {
  const matchedModel = modelsByQualifiedRef.get(getQualifiedModelKey(id, normalizePath(file)));

  return matchedModel ? [matchedModel] : [];
}

function getQualifiedModelKey(name: string, file: string): string {
  return `${name}\0${normalizePath(file)}`;
}

function formatTypeReference(typeReference: TypeReference): string {
  if (typeReference.file === undefined) {
    return typeReference.id;
  }

  return `${typeReference.id} @ ${typeReference.file}`;
}

function pickConfiguredName(modelName: string, configuredNames: Set<string>): string | undefined {
  const nameCandidates = Array.from(configuredNames).filter((value) => value !== modelName);

  if (nameCandidates.length === 0) {
    return undefined;
  }

  return nameCandidates.toSorted((left, right) => left.localeCompare(right))[0];
}

function toConfigRelativePath(absolutePath: string, configDirectory: string): string {
  return normalizePath(path.relative(configDirectory, absolutePath));
}

function compileIncludePattern(pattern: string): { pattern: string; matcher: Minimatch } {
  return {
    pattern,
    matcher: new Minimatch(normalizePath(pattern), {
      dot: true,
      nocomment: true,
      nonegate: true,
    }),
  };
}
