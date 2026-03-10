import type { TaskStreamActivityItem } from "@/components/task-stream-activity";

type ToolActivityPresentation = Pick<
  TaskStreamActivityItem,
  "label" | "summary" | "badges" | "details" | "detailSections"
>;

type ToolPartState = {
  input?: unknown;
  output?: unknown;
  title?: string;
  error?: unknown;
  raw?: unknown;
  attachments?: unknown[];
};

type FileChangeSummary = {
  action: "add" | "update" | "delete";
  path: string;
  added: number;
  removed: number;
};

export function buildToolActivityPresentation(args: {
  toolName: string;
  status: string;
  state: ToolPartState;
}): ToolActivityPresentation {
  const normalizedToolName = normalizeToolName(args.toolName);

  if (normalizedToolName === "bash") {
    return buildBashPresentation(args.status, args.state);
  }

  if (isFileChangeTool(normalizedToolName)) {
    return buildFileChangePresentation(normalizedToolName, args.status, args.state);
  }

  return buildGenericToolPresentation(args.toolName, args.status, args.state);
}

function buildBashPresentation(status: string, state: ToolPartState): ToolActivityPresentation {
  const input = asObject(state.input);
  const description = getString(input?.description) ?? getString(state.title);
  const command = getString(input?.command);
  const workdir = getString(input?.workdir);
  const output = formatDetailValue(state.output, 1200);
  const error = formatDetailValue(state.error, 1200);
  const request = formatDetailValue(state.raw, 800);
  const summary = description ?? summarizeCommand(command) ?? statusLabel(status);
  const badges: string[] = [];

  if (workdir) {
    badges.push(shortenPath(workdir));
  }

  const outputLineCount = countLines(output);
  if (outputLineCount > 0) {
    badges.push(`${outputLineCount} ${outputLineCount === 1 ? "line" : "lines"}`);
  }

  return {
    label: `Bash ${statusLabel(status)}`,
    summary,
    badges: badges.length > 0 ? badges : undefined,
    detailSections: compactSections([
      workdir ? { label: "Working directory", value: workdir } : null,
      command ? { label: "Command", value: command, code: true } : null,
      request ? { label: "Request", value: request, code: true } : null,
      output ? { label: "Output", value: output, code: true } : null,
      error ? { label: "Error", value: error, code: true } : null,
    ]),
  };
}

function buildFileChangePresentation(
  normalizedToolName: string,
  status: string,
  state: ToolPartState,
): ToolActivityPresentation {
  const input = asObject(state.input);
  const patchText = getString(input?.patchText);
  const filePath = getString(input?.filePath);
  const content = getString(input?.content);
  const changeSet = patchText ? parseApplyPatchSummary(patchText) : [];
  const totalAdded = changeSet.reduce((sum, change) => sum + change.added, 0);
  const totalRemoved = changeSet.reduce((sum, change) => sum + change.removed, 0);

  if (changeSet.length > 0) {
    const primaryChange = changeSet[0];
    const summary =
      changeSet.length === 1
        ? `${toActionLabel(primaryChange.action)} ${primaryChange.path}`
        : `${toActionLabel(primaryChange.action)} ${changeSet.length} files`;

    return {
      label: `${toDisplayToolName(normalizedToolName)} ${statusLabel(status)}`,
      summary,
      badges: compactBadges([
        `${changeSet.length} ${changeSet.length === 1 ? "file" : "files"}`,
        totalAdded > 0 ? `+${totalAdded}` : null,
        totalRemoved > 0 ? `-${totalRemoved}` : null,
      ]),
      detailSections: [
        {
          label: "Files",
          value: changeSet
            .map(
              (change) =>
                `${toActionLabel(change.action)} ${change.path} (+${change.added} -${change.removed})`,
            )
            .join("\n"),
        },
      ],
      details: state.title ? [`Result: ${state.title}`] : undefined,
    };
  }

  if (filePath) {
    const lineCount = countLines(content);
    return {
      label: `${toDisplayToolName(normalizedToolName)} ${statusLabel(status)}`,
      summary: `${toActionLabel(getFileToolAction(normalizedToolName))} ${filePath}`,
      badges: compactBadges([
        lineCount > 0 ? `${lineCount} ${lineCount === 1 ? "line" : "lines"}` : null,
      ]),
      detailSections: compactSections([
        content ? { label: "Content", value: truncateText(content, 1200), code: true } : null,
        state.title ? { label: "Result", value: state.title } : null,
      ]),
    };
  }

  return buildGenericToolPresentation(normalizedToolName, status, state);
}

function buildGenericToolPresentation(
  toolName: string,
  status: string,
  state: ToolPartState,
): ToolActivityPresentation {
  const input = formatDetailValue(state.input, 800);
  const output = formatDetailValue(state.output, 1000);
  const error = formatDetailValue(state.error, 1000);
  const request = formatDetailValue(state.raw, 600);
  const summary = getString(state.title) ?? statusLabel(status);

  return {
    label: `${toDisplayToolName(toolName)} ${statusLabel(status)}`,
    summary,
    detailSections: compactSections([
      input ? { label: "Input", value: input, code: true } : null,
      request ? { label: "Request", value: request, code: true } : null,
      output ? { label: "Output", value: output, code: true } : null,
      error ? { label: "Error", value: error, code: true } : null,
    ]),
  };
}

function normalizeToolName(toolName: string): string {
  return toolName.trim().toLowerCase().split(/[./]/).at(-1) ?? toolName.trim().toLowerCase();
}

function isFileChangeTool(toolName: string): boolean {
  return (
    toolName.includes("apply_patch") || toolName.includes("write") || toolName.includes("edit")
  );
}

function getFileToolAction(toolName: string): FileChangeSummary["action"] {
  if (toolName.includes("delete")) {
    return "delete";
  }

  if (toolName.includes("write") || toolName.includes("add")) {
    return "add";
  }

  return "update";
}

function parseApplyPatchSummary(patchText: string): FileChangeSummary[] {
  const lines = patchText.split(/\r?\n/);
  const changes: FileChangeSummary[] = [];
  let current: FileChangeSummary | null = null;

  for (const line of lines) {
    const fileHeader = parseFileHeader(line);
    if (fileHeader) {
      current = { ...fileHeader, added: 0, removed: 0 };
      changes.push(current);
      continue;
    }

    if (!current) {
      continue;
    }

    if (line.startsWith("+") && !line.startsWith("+++")) {
      current.added += 1;
      continue;
    }

    if (line.startsWith("-") && !line.startsWith("---")) {
      current.removed += 1;
    }
  }

  return changes;
}

function parseFileHeader(line: string): Omit<FileChangeSummary, "added" | "removed"> | null {
  const trimmed = line.trim();

  if (trimmed.startsWith("*** Add File: ")) {
    return { action: "add", path: trimmed.replace("*** Add File: ", "") };
  }

  if (trimmed.startsWith("*** Update File: ")) {
    return { action: "update", path: trimmed.replace("*** Update File: ", "") };
  }

  if (trimmed.startsWith("*** Delete File: ")) {
    return { action: "delete", path: trimmed.replace("*** Delete File: ", "") };
  }

  return null;
}

function toActionLabel(action: FileChangeSummary["action"]): string {
  switch (action) {
    case "add":
      return "Add";
    case "delete":
      return "Delete";
    case "update":
    default:
      return "Update";
  }
}

function toDisplayToolName(toolName: string): string {
  const normalized = normalizeToolName(toolName);
  if (normalized === "apply_patch") {
    return "File change";
  }

  return `${normalized[0]?.toUpperCase() ?? ""}${normalized.slice(1)}`;
}

function statusLabel(status: string): string {
  switch (status) {
    case "completed":
      return "completed";
    case "running":
      return "running";
    case "pending":
      return "queued";
    case "error":
      return "failed";
    default:
      return status;
  }
}

function summarizeCommand(command: string | null): string | null {
  if (!command) {
    return null;
  }

  const normalized = command.trim().replace(/\s+/g, " ");
  if (normalized.length === 0) {
    return null;
  }

  return truncateText(normalized, 120);
}

function formatDetailValue(value: unknown, maxLength: number): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? truncateText(trimmed, maxLength) : null;
  }

  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }

  if (Array.isArray(value)) {
    const rendered = value
      .map((entry) => formatDetailValue(entry, Math.floor(maxLength / 2)) ?? "")
      .filter((entry) => entry.length > 0)
      .join("\n");
    return rendered.length > 0 ? truncateText(rendered, maxLength) : null;
  }

  if (typeof value === "object") {
    return truncateText(JSON.stringify(value, null, 2), maxLength);
  }

  return null;
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  if (maxLength <= 3) {
    return value.slice(0, maxLength);
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function compactSections(
  sections: Array<{ label: string; value: string; code?: boolean } | null>,
): TaskStreamActivityItem["detailSections"] {
  const filtered = sections.filter(
    (section): section is { label: string; value: string; code?: boolean } => section !== null,
  );
  return filtered.length > 0 ? filtered : undefined;
}

function compactBadges(values: Array<string | null>): string[] | undefined {
  const filtered = values.filter((value): value is string => value !== null && value.length > 0);
  return filtered.length > 0 ? filtered : undefined;
}

function countLines(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }

  return value.split(/\r?\n/).filter((line) => line.length > 0).length;
}

function shortenPath(value: string): string {
  return (
    value
      .split("/")
      .filter((segment) => segment.length > 0)
      .slice(-2)
      .join("/") || value
  );
}
