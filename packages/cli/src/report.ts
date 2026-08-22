import type { AnalysisReport } from "./functions/run/models/report";

export type { AnalysisReport };

export function formatReport(report: AnalysisReport, format: "json"): string {
  if (format !== "json") {
    throw new Error("Unsupported format");
  }

  return `${JSON.stringify(report, null, 2)}\n`;
}
