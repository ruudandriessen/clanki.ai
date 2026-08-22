import { buildAnalysisReport } from "../project";
import { formatReport } from "../report";
import type { AnalysisReport } from "./run/models/report";

export type OutputFormat = "json";

export interface AnalyzeOptions {
  config: string;
  format?: OutputFormat;
  project: string;
}

export interface AnalyzeResult {
  report: AnalysisReport;
  output: string;
}

export async function analyze(options: AnalyzeOptions): Promise<AnalyzeResult> {
  const report = await buildAnalysisReport(options.project, options.config);
  const output = formatReport(report, options.format ?? "json");

  return {
    report,
    output,
  };
}
