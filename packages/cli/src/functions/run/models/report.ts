import { z } from "zod";

export const ANALYSIS_REPORT_SCHEMA_VERSION = 1 as const;

const finiteNumberSchema = z.number().finite();

const sourceLocationSchema = z
  .object({
    file: z.string(),
    line: finiteNumberSchema,
    column: finiteNumberSchema,
  })
  .strict();

const modelMemberSummarySchema = z
  .object({
    kind: z.string(),
    name: z.string(),
  })
  .strict();

const modelSummarySchema = z
  .object({
    id: z.string(),
    kind: z.string(),
    name: z.string(),
    location: sourceLocationSchema,
    isDefaultExport: z.boolean(),
    isExported: z.boolean(),
    jsDocSummary: z.string().nullable(),
    members: z.array(modelMemberSummarySchema),
    referencedTypeNames: z.array(z.string()),
    sourceText: z.string(),
  })
  .strict();

const sourceFileGroupMemberSummarySchema = z
  .object({
    kind: z.literal("source-file"),
    path: z.string(),
    matchedBy: z.array(z.string()),
  })
  .strict();

const modelGroupMemberSummarySchema = z
  .object({
    kind: z.literal("model"),
    id: z.string(),
    name: z.string(),
    file: z.string(),
    matchedBy: z.array(z.string()),
    sourceText: z.string(),
  })
  .strict();

const unmatchedGroupMemberSummarySchema = z
  .object({
    kind: z.union([z.literal("include-pattern"), z.literal("type-reference")]),
    value: z.string(),
  })
  .strict();

const groupPositionSummarySchema = z
  .object({
    x: finiteNumberSchema,
    y: finiteNumberSchema,
  })
  .strict();

export const groupEdgeSchema = z
  .object({
    from: z.string().trim().min(1),
    to: z.string().trim().min(1),
  })
  .strict();

export const groupEdgesSchema = z.array(groupEdgeSchema);

const moduleGroupSummarySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    type: z.literal("module"),
    position: groupPositionSummarySchema,
    width: z.number(),
    height: z.number(),
    include: z.array(z.string()).optional(),
    matchedMembers: z.array(sourceFileGroupMemberSummarySchema),
    unmatchedMembers: z.array(unmatchedGroupMemberSummarySchema),
  })
  .strict();

const dataStructureGroupSummarySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    type: z.literal("data-structure"),
    width: z.number(),
    height: z.number(),
    position: groupPositionSummarySchema,
    matchedMembers: z.array(modelGroupMemberSummarySchema),
    unmatchedMembers: z.array(unmatchedGroupMemberSummarySchema),
  })
  .strict();

export const groupSummarySchema = z.discriminatedUnion("type", [
  moduleGroupSummarySchema,
  dataStructureGroupSummarySchema,
]);

const coverageSummarySchema = z
  .object({
    covered: finiteNumberSchema,
    total: finiteNumberSchema,
    percentage: finiteNumberSchema,
  })
  .strict();

const analysisSummarySchema = z
  .object({
    sourceFileCoverage: coverageSummarySchema,
    modelCoverage: coverageSummarySchema,
  })
  .strict();

const compilerOptionsSummarySchema = z
  .object({
    baseUrl: z.string().nullable(),
    jsx: z.string().nullable(),
    module: z.string().nullable(),
    strict: z.boolean(),
    target: z.string().nullable(),
    pathsDefined: z.boolean(),
  })
  .strict();

const projectSummarySchema = z
  .object({
    compilerOptions: compilerOptionsSummarySchema,
    projectDirectory: z.string(),
    sourceFileCount: finiteNumberSchema,
    sourceFiles: z.array(z.string()),
    tsconfigPath: z.string(),
  })
  .strict();

const diagnosticSummarySchema = z
  .object({
    category: z.string(),
    code: finiteNumberSchema,
    column: finiteNumberSchema.nullable(),
    file: z.string().nullable(),
    line: finiteNumberSchema.nullable(),
    message: z.string(),
  })
  .strict();

const entrypointSummarySchema = z
  .object({
    file: z.string(),
    kind: z.string(),
  })
  .strict();

const analysisGraphNodeSummarySchema = z
  .object({
    id: z.string(),
    type: z.union([z.literal("source-file"), z.literal("model")]),
    label: z.string(),
    sourceFile: z.string(),
  })
  .strict();

const analysisGraphEdgeSummarySchema = z
  .object({
    from: z.string(),
    to: z.string(),
    type: z.union([z.literal("imports"), z.literal("defines-model"), z.literal("references-type")]),
  })
  .strict();

const analysisGraphSummarySchema = z
  .object({
    nodes: z.array(analysisGraphNodeSummarySchema),
    edges: z.array(analysisGraphEdgeSummarySchema),
  })
  .strict();

const relationshipSummarySchema = z
  .object({
    from: z.string(),
    to: z.string(),
    type: z.string(),
  })
  .strict();

const sourceFileDependencySummarySchema = z
  .object({
    fromFile: z.string(),
    toFile: z.string(),
  })
  .strict();

const ruleViolationSummarySchema = z
  .object({
    rule: z.string(),
    from: z.string(),
    to: z.string(),
    relationshipType: z.string(),
  })
  .strict();

const ungroupedModelSummarySchema = z
  .object({
    id: z.string(),
    kind: z.string(),
    name: z.string(),
    location: sourceLocationSchema,
  })
  .strict();

const strictCheckSummarySchema = z
  .object({
    ungroupedSourceFiles: z.array(z.string()),
    ungroupedModels: z.array(ungroupedModelSummarySchema),
    summary: analysisSummarySchema,
  })
  .strict();

const rulesCheckSummarySchema = z
  .object({
    violations: z.array(ruleViolationSummarySchema),
  })
  .strict();

const checkResultsSummarySchema = z
  .object({
    strict: strictCheckSummarySchema,
    rules: rulesCheckSummarySchema,
  })
  .strict();

export const normalizedChecksInputSchema = z
  .object({
    strict: z
      .object({
        ungroupedSourceFiles: z.array(z.string()).optional(),
        ungroupedModels: z.array(ungroupedModelSummarySchema).optional(),
        summary: analysisSummarySchema.optional(),
      })
      .strict()
      .optional(),
    rules: z
      .object({
        violations: z.array(ruleViolationSummarySchema).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const analysisReportMigrationSchema = z
  .object({
    schemaVersion: z.literal(ANALYSIS_REPORT_SCHEMA_VERSION),
    project: projectSummarySchema,
    diagnostics: z.array(diagnosticSummarySchema),
    entrypoints: z.array(entrypointSummarySchema),
    analysisGraph: analysisGraphSummarySchema,
    models: z.array(modelSummarySchema),
    groups: z.array(groupSummarySchema),
    relationships: z.array(relationshipSummarySchema),
    sourceFileDependencies: z.array(sourceFileDependencySummarySchema).optional(),
    ruleViolations: z.array(ruleViolationSummarySchema).optional(),
    ungroupedSourceFiles: z.array(z.string()).optional(),
    ungroupedModels: z.array(ungroupedModelSummarySchema).optional(),
    summary: analysisSummarySchema.optional(),
    checks: z.unknown().optional(),
  })
  .strict();

export const analysisReportSchema = z
  .object({
    schemaVersion: z.literal(ANALYSIS_REPORT_SCHEMA_VERSION),
    project: projectSummarySchema,
    diagnostics: z.array(diagnosticSummarySchema),
    entrypoints: z.array(entrypointSummarySchema),
    analysisGraph: analysisGraphSummarySchema,
    models: z.array(modelSummarySchema),
    groups: z.array(groupSummarySchema),
    ungroupedSourceFiles: z.array(z.string()),
    ungroupedModels: z.array(ungroupedModelSummarySchema),
    summary: analysisSummarySchema,
    checks: checkResultsSummarySchema,
    relationships: z.array(relationshipSummarySchema),
    ruleViolations: z.array(ruleViolationSummarySchema),
    sourceFileDependencies: z.array(sourceFileDependencySummarySchema),
  })
  .strict();

export const groupSummariesSchema = z.array(groupSummarySchema);

export const createGroupInputSchema = z
  .object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    type: z.union([z.literal("module"), z.literal("data-structure")]),
    position: groupPositionSummarySchema,
    width: z.number().finite().positive(),
    height: z.number().finite().positive(),
  })
  .strict();

export const updateGroupInputSchema = z
  .object({
    groupId: z.string().min(1),
    name: z.string().trim().min(1).optional(),
    include: z.array(z.string().trim().min(1)).min(1).optional(),
    position: groupPositionSummarySchema.optional(),
  })
  .refine(
    (input) =>
      input.name !== undefined || input.include !== undefined || input.position !== undefined,
    "Expected at least one group field to update.",
  )
  .strict();

export const deleteGroupInputSchema = z
  .object({
    groupId: z.string().trim().min(1),
  })
  .strict();

export const addGroupEdgeInputSchema = z
  .object({
    fromGroupId: z.string().trim().min(1),
    toGroupId: z.string().trim().min(1),
  })
  .strict();

export const writeConfigResultSchema = z
  .object({
    config: z.unknown(),
    rebuildError: z.string().nullable(),
  })
  .strict();

export const reportRebuildResultSchema = z
  .object({
    ok: z.literal(true),
  })
  .strict();

export type AnalysisReport = z.infer<typeof analysisReportSchema>;
export type ProjectSummary = z.infer<typeof projectSummarySchema>;
export type CompilerOptionsSummary = z.infer<typeof compilerOptionsSummarySchema>;
export type DiagnosticSummary = z.infer<typeof diagnosticSummarySchema>;
export type EntrypointSummary = z.infer<typeof entrypointSummarySchema>;
export type AnalysisGraphSummary = z.infer<typeof analysisGraphSummarySchema>;
export type AnalysisGraphNodeSummary = z.infer<typeof analysisGraphNodeSummarySchema>;
export type AnalysisGraphEdgeSummary = z.infer<typeof analysisGraphEdgeSummarySchema>;
export type SourceLocation = z.infer<typeof sourceLocationSchema>;
export type ModelMemberSummary = z.infer<typeof modelMemberSummarySchema>;
export type ModelSummary = z.infer<typeof modelSummarySchema>;
export type RelationshipSummary = z.infer<typeof relationshipSummarySchema>;
export type SourceFileDependencySummary = z.infer<typeof sourceFileDependencySummarySchema>;
export type UngroupedModelSummary = z.infer<typeof ungroupedModelSummarySchema>;
export type AnalysisSummary = z.infer<typeof analysisSummarySchema>;
export type CoverageSummary = z.infer<typeof coverageSummarySchema>;
export type CheckResultsSummary = z.infer<typeof checkResultsSummarySchema>;
export type StrictCheckSummary = z.infer<typeof strictCheckSummarySchema>;
export type RulesCheckSummary = z.infer<typeof rulesCheckSummarySchema>;
export type GroupPositionSummary = z.infer<typeof groupPositionSummarySchema>;
export type GroupEdge = z.infer<typeof groupEdgeSchema>;
export type AddGroupEdgeInput = z.infer<typeof addGroupEdgeInputSchema>;
export type GroupSummary = z.infer<typeof groupSummarySchema>;
export type UpdateGroupInput = z.infer<typeof updateGroupInputSchema>;
export type ModuleGroupSummary = z.infer<typeof moduleGroupSummarySchema>;
export type DataStructureGroupSummary = z.infer<typeof dataStructureGroupSummarySchema>;
export type CreateGroupInput = z.infer<typeof createGroupInputSchema>;
export type SourceFileGroupMemberSummary = z.infer<typeof sourceFileGroupMemberSummarySchema>;
export type ModelGroupMemberSummary = z.infer<typeof modelGroupMemberSummarySchema>;
export type UnmatchedGroupMemberSummary = z.infer<typeof unmatchedGroupMemberSummarySchema>;
export type RuleViolationSummary = z.infer<typeof ruleViolationSummarySchema>;
