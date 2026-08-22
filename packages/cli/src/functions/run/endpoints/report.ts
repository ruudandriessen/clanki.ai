import { TRPCError } from "@trpc/server";
import { formatRuntimeError } from "../../ui-runtime";
import { t } from "../trpc";
import { analysisReportSchema, reportRebuildResultSchema } from "../models/report";
import { parseAnalysisReport } from "./parseAnalysisReport";

export const reportRouter = t.router({
  json: t.procedure.output(analysisReportSchema).query(({ ctx }) => {
    const reportJson = ctx.runtime.getReportJson();

    if (reportJson === null) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          ctx.runtime.getReportError() ?? "No report is available yet. Trigger report.rebuild.",
      });
    }

    return parseAnalysisReport(JSON.parse(reportJson) as unknown);
  }),
  rebuild: t.procedure.output(reportRebuildResultSchema).mutation(async ({ ctx }) => {
    try {
      await ctx.runtime.rebuildReport();
      return { ok: true as const };
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: formatRuntimeError(error),
        cause: error,
      });
    }
  }),
});
