import type z from "zod";
import {
  groupSummariesSchema,
  ANALYSIS_REPORT_SCHEMA_VERSION,
  type GroupSummary,
  type AnalysisReport,
  analysisReportMigrationSchema,
  type AnalysisSummary,
  type CheckResultsSummary,
  type CoverageSummary,
  type ModelSummary,
  type RuleViolationSummary,
  type UngroupedModelSummary,
  normalizedChecksInputSchema,
} from "../models/report";

export function parseAnalysisReport(raw: unknown): AnalysisReport {
  return migrateAnalysisReport(raw);
}

export function parseGroupSummaries(raw: unknown): GroupSummary[] {
  return parseWithSchema(groupSummariesSchema, raw, "Group summaries must match schema");
}

export function migrateAnalysisReport(raw: unknown): AnalysisReport {
  const report = parseWithSchema(
    analysisReportMigrationSchema,
    raw,
    "Analysis report must match schema",
  );

  const sourceFileDependencies = report.sourceFileDependencies ?? [];
  const ruleViolations = report.ruleViolations ?? [];
  const ungroupedSourceFiles =
    report.ungroupedSourceFiles ??
    collectFallbackUngroupedSourceFiles(report.project.sourceFiles, report.groups);
  const ungroupedModels =
    report.ungroupedModels ?? collectFallbackUngroupedModels(report.models, report.groups);
  const summary =
    report.summary ??
    buildFallbackSummary(
      report.project.sourceFileCount,
      report.models.length,
      ungroupedSourceFiles.length,
      ungroupedModels.length,
    );

  const checks = normalizeChecks(
    report.checks,
    ungroupedSourceFiles,
    ungroupedModels,
    summary,
    ruleViolations,
  );

  return {
    schemaVersion: ANALYSIS_REPORT_SCHEMA_VERSION,
    project: report.project,
    diagnostics: report.diagnostics,
    entrypoints: report.entrypoints,
    analysisGraph: report.analysisGraph,
    models: report.models,
    groups: report.groups,
    ungroupedSourceFiles,
    ungroupedModels,
    summary,
    checks,
    relationships: report.relationships,
    ruleViolations,
    sourceFileDependencies,
  };
}

function normalizeChecks(
  rawChecks: unknown,
  ungroupedSourceFiles: string[],
  ungroupedModels: UngroupedModelSummary[],
  summary: AnalysisSummary,
  ruleViolations: RuleViolationSummary[],
): CheckResultsSummary {
  if (rawChecks === undefined) {
    return {
      strict: {
        ungroupedSourceFiles,
        ungroupedModels,
        summary,
      },
      rules: {
        violations: ruleViolations,
      },
    };
  }

  const parsedChecks = normalizedChecksInputSchema.safeParse(rawChecks);
  if (!parsedChecks.success) {
    return {
      strict: {
        ungroupedSourceFiles,
        ungroupedModels,
        summary,
      },
      rules: {
        violations: ruleViolations,
      },
    };
  }

  const strict = parsedChecks.data.strict;
  const rules = parsedChecks.data.rules;

  return {
    strict: {
      ungroupedSourceFiles: strict?.ungroupedSourceFiles ?? ungroupedSourceFiles,
      ungroupedModels: strict?.ungroupedModels ?? ungroupedModels,
      summary: strict?.summary ?? summary,
    },
    rules: {
      violations: rules?.violations ?? ruleViolations,
    },
  };
}

function collectFallbackUngroupedSourceFiles(
  sourceFiles: string[],
  groups: GroupSummary[],
): string[] {
  const groupedSourceFiles = new Set<string>();

  for (const group of groups) {
    if (group.type !== "module") {
      continue;
    }

    for (const member of group.matchedMembers) {
      groupedSourceFiles.add(member.path);
    }
  }

  return sourceFiles
    .filter((sourceFile) => !groupedSourceFiles.has(sourceFile))
    .toSorted((left, right) => left.localeCompare(right));
}

function collectFallbackUngroupedModels(
  models: ModelSummary[],
  groups: GroupSummary[],
): UngroupedModelSummary[] {
  const groupedModelIds = new Set<string>();

  for (const group of groups) {
    if (group.type !== "data-structure") {
      continue;
    }

    for (const member of group.matchedMembers) {
      groupedModelIds.add(member.id);
    }
  }

  return models
    .filter((model) => !groupedModelIds.has(model.id))
    .map((model) => ({
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

function buildFallbackSummary(
  totalSourceFiles: number,
  totalModels: number,
  ungroupedSourceFileCount: number,
  ungroupedModelCount: number,
): AnalysisSummary {
  const sourceFileCovered = Math.max(0, totalSourceFiles - ungroupedSourceFileCount);
  const modelCovered = Math.max(0, totalModels - ungroupedModelCount);

  return {
    sourceFileCoverage: buildCoverageSummary(sourceFileCovered, totalSourceFiles),
    modelCoverage: buildCoverageSummary(modelCovered, totalModels),
  };
}

function buildCoverageSummary(covered: number, total: number): CoverageSummary {
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
    percentage: Math.round((covered / total) * 10000) / 100,
  };
}

function parseWithSchema<T>(schema: z.ZodType<T>, raw: unknown, errorPrefix: string): T {
  const parsed = schema.safeParse(raw);
  if (parsed.success) {
    return parsed.data;
  }

  const details = parsed.error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
  throw new Error(`${errorPrefix}. ${details}`);
}
