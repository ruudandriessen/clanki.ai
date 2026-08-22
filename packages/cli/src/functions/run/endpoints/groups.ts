import { TRPCError } from "@trpc/server";
import { formatRuntimeError } from "../../ui-runtime";
import { t } from "../trpc";
import {
  deleteGroupInputSchema,
  type GroupSummary,
  type ModuleGroupSummary,
  createGroupInputSchema,
  groupSummariesSchema,
  updateGroupInputSchema,
  writeConfigResultSchema,
} from "../models/report";
import { parseAnalysisReport } from "./parseAnalysisReport";
import { runSerializedConfigMutation } from "./config-mutation-queue";
import {
  type Group,
  type ClankiConfig,
  clankiConfigSchema,
  type ModuleGroup,
} from "../../../model/config";

type ListedGroupSummary = GroupSummary | (ModuleGroupSummary & { include: string[] });

export const groupsRouter = t.router({
  list: t.procedure.output(groupSummariesSchema).query(async ({ ctx }) => {
    try {
      const config = await readValidatedConfig(ctx.runtime.readConfig);
      const moduleIncludesById = new Map<string, string[]>();
      const groupPositionsById = new Map<
        string,
        {
          x: number;
          y: number;
        }
      >();

      for (const group of config.groups) {
        groupPositionsById.set(group.id, { ...group.position });

        if (group.type === "module") {
          moduleIncludesById.set(group.id, [...group.include]);
        }
      }

      const reportJson = ctx.runtime.getReportJson();
      if (reportJson !== null) {
        try {
          const groups = parseAnalysisReport(JSON.parse(reportJson) as unknown).groups.map(
            (group) => ({
              ...group,
              position: groupPositionsById.get(group.id) ?? group.position,
            }),
          );
          return groups.map((group) => {
            if (group.type !== "module") {
              return group;
            }

            return {
              ...group,
              include: moduleIncludesById.get(group.id) ?? [],
            };
          });
        } catch {
          // If the in-memory report payload is stale/invalid, fall back to config groups.
        }
      }

      return config.groups.map(mapConfigGroupToSummary);
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: formatRuntimeError(error),
        cause: error,
      });
    }
  }),
  create: t.procedure
    .input(createGroupInputSchema)
    .output(writeConfigResultSchema)
    .mutation(
      async ({ ctx, input }) =>
        await runSerializedConfigMutation(async () => {
          try {
            const config = await readValidatedConfig(ctx.runtime.readConfig);
            const groupExists = config.groups.some((group) => group.id === input.id);

            if (groupExists) {
              throw new TRPCError({
                code: "CONFLICT",
                message: `Group '${input.id}' already exists.`,
              });
            }

            const group: Group =
              input.type === "module"
                ? {
                    id: input.id,
                    name: input.name,
                    type: input.type,
                    position: input.position,
                    width: input.width,
                    height: input.height,
                    include: [],
                  }
                : {
                    id: input.id,
                    name: input.name,
                    type: input.type,
                    position: input.position,
                    width: input.width,
                    height: input.height,
                    types: [],
                  };

            const result = await ctx.runtime.writeConfig({
              ...config,
              groups: [...config.groups, group],
            });

            if (result.rebuildError !== null) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: result.rebuildError,
              });
            }

            return result;
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
    ),
  update: t.procedure
    .input(updateGroupInputSchema)
    .output(writeConfigResultSchema)
    .mutation(
      async ({ ctx, input }) =>
        await runSerializedConfigMutation(async () => {
          try {
            const config = await readValidatedConfig(ctx.runtime.readConfig);
            const group = config.groups.find((candidate) => candidate.id === input.groupId);

            if (!group) {
              throw new TRPCError({
                code: "NOT_FOUND",
                message: `Group '${input.groupId}' was not found.`,
              });
            }

            if (input.include !== undefined && group.type !== "module") {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `Group '${input.groupId}' is not a module group.`,
              });
            }

            const hasNameChange = input.name !== undefined && input.name !== group.name;
            const hasIncludeChange =
              group.type === "module" &&
              input.include !== undefined &&
              !areStringArraysEqual(input.include, group.include);
            const hasPositionChange =
              input.position !== undefined && !arePositionsEqual(input.position, group.position);

            if (!hasNameChange && !hasIncludeChange && !hasPositionChange) {
              return { config, rebuildError: null };
            }

            const nextConfig: ClankiConfig = {
              ...config,
              groups: config.groups.map((candidate) => {
                if (candidate.id !== input.groupId) return candidate;
                return {
                  ...candidate,
                  ...(input.name !== undefined ? { name: input.name } : {}),
                  ...(input.include !== undefined && candidate.type === "module"
                    ? { include: [...input.include] }
                    : {}),
                  ...(input.position !== undefined ? { position: { ...input.position } } : {}),
                };
              }),
            };

            const result = await ctx.runtime.writeConfig(nextConfig, {
              skipRebuild: hasPositionChange && !hasNameChange && !hasIncludeChange,
            });

            if (result.rebuildError !== null) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: result.rebuildError,
              });
            }

            return result;
          } catch (error) {
            if (error instanceof TRPCError) {
              throw error;
            }

            throw new TRPCError({
              code: "BAD_REQUEST",
              message: formatRuntimeError(error),
              cause: error,
            });
          }
        }),
    ),
  delete: t.procedure
    .input(deleteGroupInputSchema)
    .output(writeConfigResultSchema)
    .mutation(
      async ({ ctx, input }) =>
        await runSerializedConfigMutation(async () => {
          try {
            const config = await readValidatedConfig(ctx.runtime.readConfig);
            const groupExists = config.groups.some((group) => group.id === input.groupId);

            if (!groupExists) {
              throw new TRPCError({
                code: "NOT_FOUND",
                message: `Group '${input.groupId}' was not found.`,
              });
            }

            const nextRules = config.rules?.filter(
              (rule) => rule.from !== input.groupId && rule.to !== input.groupId,
            );

            const nextConfig: ClankiConfig = {
              ...config,
              groups: config.groups.filter((group) => group.id !== input.groupId),
              ...(nextRules !== undefined ? { rules: nextRules } : {}),
            };

            const result = await ctx.runtime.writeConfig(nextConfig);

            if (result.rebuildError !== null) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: result.rebuildError,
              });
            }

            return result;
          } catch (error) {
            if (error instanceof TRPCError) {
              throw error;
            }

            throw new TRPCError({
              code: "BAD_REQUEST",
              message: formatRuntimeError(error),
              cause: error,
            });
          }
        }),
    ),
});

async function readValidatedConfig(readConfig: () => Promise<unknown>): Promise<ClankiConfig> {
  return clankiConfigSchema.parse(await readConfig());
}

function mapConfigGroupToSummary(group: Group): ListedGroupSummary {
  if (group.type === "module") {
    return mapModuleGroupToSummary(group);
  }

  return {
    id: group.id,
    name: group.name,
    type: "data-structure",
    position: group.position,
    height: group.height,
    width: group.width,
    matchedMembers: [],
    unmatchedMembers: [],
  };
}

function arePositionsEqual(
  left: { x: number; y: number },
  right: { x: number; y: number },
): boolean {
  return left.x === right.x && left.y === right.y;
}

function areStringArraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function mapModuleGroupToSummary(group: ModuleGroup): ListedGroupSummary {
  return {
    id: group.id,
    name: group.name,
    type: "module",
    position: group.position,
    height: group.height,
    width: group.width,
    include: [...group.include],
    matchedMembers: [],
    unmatchedMembers: [],
  };
}
