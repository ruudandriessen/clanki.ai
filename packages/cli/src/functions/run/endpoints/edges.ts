import { TRPCError } from "@trpc/server";

import { formatRuntimeError } from "../../ui-runtime";
import { t } from "../trpc";
import {
  addGroupEdgeInputSchema,
  groupEdgesSchema,
  writeConfigResultSchema,
} from "../models/report";
import { type ClankiConfig, clankiConfigSchema } from "../../../model/config";

export const edgesRouter = t.router({
  list: t.procedure.output(groupEdgesSchema).query(async ({ ctx }) => {
    try {
      const config = await readValidatedConfig(ctx.runtime.readConfig);
      return sortGroupEdges(config.edges ?? []);
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: formatRuntimeError(error),
      });
    }
  }),
  add: t.procedure
    .input(addGroupEdgeInputSchema)
    .output(writeConfigResultSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        if (input.fromGroupId === input.toGroupId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "fromGroupId and toGroupId must be different.",
          });
        }

        const config = await readValidatedConfig(ctx.runtime.readConfig);
        const groupIds = new Set(config.groups.map((group) => group.id));

        if (!groupIds.has(input.fromGroupId)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Group '${input.fromGroupId}' was not found.`,
          });
        }

        if (!groupIds.has(input.toGroupId)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Group '${input.toGroupId}' was not found.`,
          });
        }

        const existingEdges = sortGroupEdges(config.edges ?? []);

        if (
          existingEdges.some(
            (edge) => edge.from === input.fromGroupId && edge.to === input.toGroupId,
          )
        ) {
          return { config, rebuildError: null };
        }

        const nextConfig: ClankiConfig = {
          ...config,
          edges: sortGroupEdges([
            ...existingEdges,
            { from: input.fromGroupId, to: input.toGroupId },
          ]),
        };

        return await ctx.runtime.writeConfig(nextConfig, { skipRebuild: true });
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: "BAD_REQUEST",
          message: formatRuntimeError(error),
        });
      }
    }),
});

async function readValidatedConfig(readConfig: () => Promise<unknown>): Promise<ClankiConfig> {
  return clankiConfigSchema.parse(await readConfig());
}

function sortGroupEdges(edges: { from: string; to: string }[]): { from: string; to: string }[] {
  return [...edges].toSorted(
    (left, right) => left.from.localeCompare(right.from) || left.to.localeCompare(right.to),
  );
}
