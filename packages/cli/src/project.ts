import path from "node:path";

import { analyzeProject, type ProjectAnalysisResult } from "./analysis-engine";
import { checkRules } from "./checks/rules";
import { assertStrictGroupCoverage, collectStrictCoverage } from "./checks/strict";
import { resolveGroups } from "./groups";
import { resolveGroupRelationships } from "./relationships";
import type { GroupSummary, AnalysisReport } from "./functions/run/models/report";
import { loadConfig } from "./loadConfig";
import type { ClankiConfig, Rule } from "./model/config";

const ANALYSIS_REPORT_SCHEMA_VERSION = 1 as const;

interface GroupingAndChecksResult {
  groups: GroupSummary[];
  strictCoverage: ReturnType<typeof collectStrictCoverage>;
  relationships: AnalysisReport["relationships"];
  ruleViolations: AnalysisReport["ruleViolations"];
}

interface BuildAnalysisReportOptions {
  enforceStrict?: boolean;
}

export async function buildAnalysisReport(
  projectPath: string,
  configPath?: string,
  options?: BuildAnalysisReportOptions,
): Promise<AnalysisReport> {
  const resolvedConfigPath = path.resolve(configPath ?? "clanki.json");
  const config = loadConfig(resolvedConfigPath);
  return buildAnalysisReportFromConfig(projectPath, config, resolvedConfigPath, options);
}

export async function buildAnalysisReportFromConfig(
  projectPath: string,
  config: ClankiConfig,
  configPath: string,
  options?: BuildAnalysisReportOptions,
): Promise<AnalysisReport> {
  const analysis = analyzeProject(projectPath);
  const enforceStrict = options?.enforceStrict ?? true;
  const groupingAndChecks = runGroupingAndChecks(
    analysis,
    config,
    configPath,
    config.rules ?? [],
    enforceStrict,
  );

  return {
    schemaVersion: ANALYSIS_REPORT_SCHEMA_VERSION,
    project: analysis.project,
    diagnostics: analysis.diagnostics,
    entrypoints: [],
    analysisGraph: analysis.graph,
    models: analysis.models,
    groups: groupingAndChecks.groups,
    ungroupedSourceFiles: groupingAndChecks.strictCoverage.ungroupedSourceFiles,
    ungroupedModels: groupingAndChecks.strictCoverage.ungroupedModels,
    summary: groupingAndChecks.strictCoverage.summary,
    checks: {
      strict: {
        ungroupedSourceFiles: groupingAndChecks.strictCoverage.ungroupedSourceFiles,
        ungroupedModels: groupingAndChecks.strictCoverage.ungroupedModels,
        summary: groupingAndChecks.strictCoverage.summary,
      },
      rules: {
        violations: groupingAndChecks.ruleViolations,
      },
    },
    relationships: groupingAndChecks.relationships,
    ruleViolations: groupingAndChecks.ruleViolations,
    sourceFileDependencies: analysis.sourceFileDependencies,
  };
}

function runGroupingAndChecks(
  analysis: ProjectAnalysisResult,
  config: ClankiConfig,
  configPath: string,
  rules: Rule[],
  enforceStrict: boolean,
): GroupingAndChecksResult {
  const groups = resolveGroups(
    config,
    configPath,
    analysis.project.projectDirectory,
    analysis.project.sourceFiles,
    analysis.models,
  );

  if (enforceStrict && config.strict) {
    assertStrictGroupCoverage(analysis.project.sourceFiles, groups);
  }

  const strictCoverage = collectStrictCoverage(
    analysis.project.sourceFiles,
    analysis.models,
    groups,
  );
  const relationships = resolveGroupRelationships(
    groups,
    analysis.models,
    analysis.sourceFileDependencies,
  );
  const ruleViolations = checkRules(rules, relationships);

  return {
    groups,
    strictCoverage,
    relationships,
    ruleViolations,
  };
}
