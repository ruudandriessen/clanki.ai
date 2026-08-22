import { z } from "zod";

const nonEmptyStringSchema = z.string().min(1);

const forbiddenDependencyRuleSchema = z.object({
  type: z.literal("forbidden-dependency"),
  from: nonEmptyStringSchema,
  to: nonEmptyStringSchema,
});

type ForbiddenDependencyRule = z.infer<typeof forbiddenDependencyRuleSchema>;

export type Rule = ForbiddenDependencyRule;

const diagramEdgeSchema = z
  .object({
    from: nonEmptyStringSchema,
    to: nonEmptyStringSchema,
  })
  .strict();

const typeReferenceSchema = z.object({
  id: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  file: nonEmptyStringSchema.optional(),
});

/** Type reference with explicit ID and user-facing name, optionally disambiguated by file path. */
export type TypeReference = z.infer<typeof typeReferenceSchema>;

const groupPositionSchema = z
  .object({
    x: z.number(),
    y: z.number(),
  })
  .strict();

const moduleGroupSchema = z.object({
  id: nonEmptyStringSchema,
  /** User-facing group name shown in reports and UI. */
  name: nonEmptyStringSchema,
  type: z.literal("module"),
  /** Saved canvas center position for interactive architecture layout. */
  position: groupPositionSchema,
  width: z.number(),
  height: z.number(),
  /**
   * Glob patterns for source files belonging to this module, relative to config file location.
   * Uses minimatch semantics with normalized "/" separators:
   * * matches a single path segment, ** matches nested path segments, and ? matches one character.
   */
  include: z.array(nonEmptyStringSchema),
});

export type ModuleGroup = z.infer<typeof moduleGroupSchema>;

const dataStructureGroupSchema = z.object({
  id: nonEmptyStringSchema,
  /** User-facing group name shown in reports and UI. */
  name: nonEmptyStringSchema,
  type: z.literal("data-structure"),
  width: z.number(),
  height: z.number(),
  /** Saved canvas center position for interactive architecture layout. */
  position: groupPositionSchema,
  /** Type references that compose this data structure. */
  types: z.array(typeReferenceSchema),
});

export type DataStructureGroup = z.infer<typeof dataStructureGroupSchema>;

const groupSchema = z.discriminatedUnion("type", [moduleGroupSchema, dataStructureGroupSchema]);

export type Group = z.infer<typeof groupSchema>;

const clankiConfigBaseSchema = z.object({
  version: z.literal(1),
  strict: z.boolean().optional().default(false),
  groups: z.array(groupSchema),
  edges: z.array(diagramEdgeSchema).optional(),
  rules: z.array(forbiddenDependencyRuleSchema).optional(),
});

export const clankiConfigSchema = clankiConfigBaseSchema.superRefine((config, ctx) => {
  const groupIds = new Set<string>();
  const edgeKeys = new Set<string>();

  for (const [groupIndex, group] of config.groups.entries()) {
    if (groupIds.has(group.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `groups[${groupIndex}]: duplicate group id '${group.id}'`,
        path: ["groups", groupIndex, "id"],
      });
      continue;
    }

    groupIds.add(group.id);
  }

  for (const [edgeIndex, edge] of (config.edges ?? []).entries()) {
    if (!groupIds.has(edge.from)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `edges[${edgeIndex}].from: unknown group '${edge.from}'`,
        path: ["edges", edgeIndex, "from"],
      });
    }

    if (!groupIds.has(edge.to)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `edges[${edgeIndex}].to: unknown group '${edge.to}'`,
        path: ["edges", edgeIndex, "to"],
      });
    }

    if (edge.from === edge.to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `edges[${edgeIndex}]: from and to must be different`,
        path: ["edges", edgeIndex],
      });
    }

    const edgeKey = `${edge.from}\0${edge.to}`;
    if (edgeKeys.has(edgeKey)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `edges[${edgeIndex}]: duplicate edge '${edge.from}' -> '${edge.to}'`,
        path: ["edges", edgeIndex],
      });
      continue;
    }

    edgeKeys.add(edgeKey);
  }

  for (const [ruleIndex, rule] of (config.rules ?? []).entries()) {
    if (!groupIds.has(rule.from)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `rules[${ruleIndex}].from: unknown group '${rule.from}'`,
        path: ["rules", ruleIndex, "from"],
      });
    }

    if (!groupIds.has(rule.to)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `rules[${ruleIndex}].to: unknown group '${rule.to}'`,
        path: ["rules", ruleIndex, "to"],
      });
    }
  }
});

export type ClankiConfig = z.infer<typeof clankiConfigSchema>;
