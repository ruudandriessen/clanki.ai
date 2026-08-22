import type {
  UngroupedModelSummary,
  AnalysisSummary,
  GroupSummary,
  UnmatchedGroupMemberSummary,
  ModelSummary,
  ModuleGroupSummary,
  DataStructureGroupSummary,
} from "../functions/run/models/report";

export interface StrictCoverageResult {
  ungroupedSourceFiles: string[];
  ungroupedModels: UngroupedModelSummary[];
  summary: AnalysisSummary;
}

interface StrictUnmatchedGroupMember {
  group: string;
  groupType: GroupSummary["type"];
  kind: UnmatchedGroupMemberSummary["kind"];
  value: string;
}

export function collectStrictCoverage(
  sourceFiles: string[],
  models: ModelSummary[],
  groups: GroupSummary[],
): StrictCoverageResult {
  const ungroupedSourceFiles = collectUngroupedSourceFiles(sourceFiles, groups);
  const ungroupedModels = collectUngroupedModels(models, groups);

  return {
    ungroupedSourceFiles,
    ungroupedModels,
    summary: buildAnalysisSummary(
      sourceFiles.length,
      ungroupedSourceFiles.length,
      models.length,
      ungroupedModels.length,
    ),
  };
}

export function assertStrictGroupCoverage(sourceFiles: string[], groups: GroupSummary[]): void {
  const ungroupedSourceFiles = collectUngroupedSourceFiles(sourceFiles, groups);
  const unmatchedGroupMembers = collectUnmatchedGroupMembers(groups);

  if (ungroupedSourceFiles.length === 0 && unmatchedGroupMembers.length === 0) {
    return;
  }

  throw new Error(formatStrictCoverageFailure(ungroupedSourceFiles, unmatchedGroupMembers));
}

function collectUngroupedSourceFiles(sourceFiles: string[], groups: GroupSummary[]): string[] {
  const groupedSourceFiles = new Set<string>();

  for (const group of groups) {
    if (!isModuleGroup(group)) {
      continue;
    }

    for (const member of group.matchedMembers) {
      groupedSourceFiles.add(normalizePath(member.path));
    }
  }

  return sourceFiles
    .map((sourceFile) => normalizePath(sourceFile))
    .filter((sourceFile) => !groupedSourceFiles.has(sourceFile))
    .toSorted((left, right) => left.localeCompare(right));
}

function collectUngroupedModels(
  models: ModelSummary[],
  groups: GroupSummary[],
): UngroupedModelSummary[] {
  const groupedModelIds = new Set<string>();

  for (const group of groups) {
    if (!isDataStructureGroup(group)) {
      continue;
    }

    for (const member of group.matchedMembers) {
      groupedModelIds.add(member.id);
    }
  }

  return models
    .filter((model) => !groupedModelIds.has(model.id))
    .map<UngroupedModelSummary>((model) => ({
      id: model.id,
      kind: model.kind,
      name: model.name,
      location: model.location,
    }))
    .toSorted(compareUngroupedModels);
}

function compareUngroupedModels(left: UngroupedModelSummary, right: UngroupedModelSummary): number {
  return (
    left.location.file.localeCompare(right.location.file) ||
    left.location.line - right.location.line ||
    left.location.column - right.location.column ||
    left.name.localeCompare(right.name) ||
    left.kind.localeCompare(right.kind)
  );
}

function buildAnalysisSummary(
  totalSourceFiles: number,
  ungroupedSourceFileCount: number,
  totalModels: number,
  ungroupedModelCount: number,
): AnalysisSummary {
  const coveredSourceFiles = totalSourceFiles - ungroupedSourceFileCount;
  const coveredModels = totalModels - ungroupedModelCount;

  return {
    sourceFileCoverage: buildCoverageSummary(coveredSourceFiles, totalSourceFiles),
    modelCoverage: buildCoverageSummary(coveredModels, totalModels),
  };
}

function buildCoverageSummary(
  covered: number,
  total: number,
): AnalysisSummary["sourceFileCoverage"] {
  if (total === 0) {
    return {
      covered: 0,
      total: 0,
      percentage: 100,
    };
  }

  return {
    covered,
    total,
    percentage: roundToTwoDecimals((covered / total) * 100),
  };
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

function isModuleGroup(group: GroupSummary): group is ModuleGroupSummary {
  return group.type === "module";
}

function isDataStructureGroup(group: GroupSummary): group is DataStructureGroupSummary {
  return group.type === "data-structure";
}

function normalizePath(value: string): string {
  return value.split("\\").join("/");
}

function collectUnmatchedGroupMembers(groups: GroupSummary[]): StrictUnmatchedGroupMember[] {
  const unmatchedGroupMembers: StrictUnmatchedGroupMember[] = [];

  for (const group of groups) {
    for (const member of group.unmatchedMembers) {
      unmatchedGroupMembers.push({
        group: group.name,
        groupType: group.type,
        kind: member.kind,
        value: member.value,
      });
    }
  }

  return unmatchedGroupMembers.toSorted(compareUnmatchedGroupMembers);
}

function compareUnmatchedGroupMembers(
  left: StrictUnmatchedGroupMember,
  right: StrictUnmatchedGroupMember,
): number {
  return (
    left.group.localeCompare(right.group) ||
    left.groupType.localeCompare(right.groupType) ||
    left.kind.localeCompare(right.kind) ||
    left.value.localeCompare(right.value)
  );
}

function formatStrictCoverageFailure(
  ungroupedSourceFiles: string[],
  unmatchedGroupMembers: StrictUnmatchedGroupMember[],
): string {
  const lines = ["Strict checks failed:"];

  if (ungroupedSourceFiles.length > 0) {
    lines.push(
      `- ${ungroupedSourceFiles.length} source file(s) are not part of any group:\n  - ${ungroupedSourceFiles.join("\n  - ")}`,
    );
  }

  if (unmatchedGroupMembers.length > 0) {
    lines.push(`- ${unmatchedGroupMembers.length} configured member(s) matched nothing:`);

    for (const member of unmatchedGroupMembers) {
      lines.push(`  - ${member.group} (${member.groupType}) ${member.kind}: ${member.value}`);
    }
  }

  return lines.join("\n");
}
