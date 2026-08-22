import { loadConfig } from "../loadConfig";
import { buildAnalysisReport } from "../project";
import type { AnalysisReport } from "./run/models/report";

export interface CheckOptions {
  config: string;
  project: string;
}

export interface CheckResult {
  report: AnalysisReport;
  output: string;
  exitCode: 0 | 1;
}

export async function check(options: CheckOptions): Promise<CheckResult> {
  const report = await buildAnalysisReport(options.project, options.config);
  const strictEnabled = loadConfig(options.config).strict;
  const strictViolations = strictEnabled ? report.checks.strict.ungroupedSourceFiles.length : 0;
  const ruleViolations = report.checks.rules.violations.length;

  if (strictViolations > 0 || ruleViolations > 0) {
    return {
      report,
      output: formatCheckFailures(report, strictEnabled),
      exitCode: 1,
    };
  }

  return {
    report,
    output: "No configured strict or rule violations found.\n",
    exitCode: 0,
  };
}

function formatCheckFailures(report: AnalysisReport, strictEnabled: boolean): string {
  const lines: string[] = ["clanki check failed."];
  const strictViolations = strictEnabled ? report.checks.strict.ungroupedSourceFiles : [];
  const ruleViolations = report.checks.rules.violations;

  if (strictViolations.length > 0) {
    lines.push(`strict violations (${strictViolations.length}):`);

    for (const sourceFile of strictViolations) {
      lines.push(`- ${sourceFile}`);
    }
  }

  if (ruleViolations.length > 0) {
    lines.push(`rule violations (${ruleViolations.length}):`);

    for (const violation of ruleViolations) {
      lines.push(
        `- ${violation.from} -> ${violation.to} (${violation.relationshipType}) [${violation.rule}]`,
      );
    }
  }

  return `${lines.join("\n")}\n`;
}
