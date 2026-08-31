import { Type } from "@earendil-works/pi-ai";
import { defineTool } from "@earendil-works/pi-coding-agent";

import { getSource, incomingDeps, listSourceFiles, outgoingDeps, searchSymbols } from "./queries";
import type { SymbolLocator, TypeScriptIndex } from "./typescript-index";

const locatorParameters = {
  file: Type.String({
    description: "Project-relative TypeScript file, for example src/accounts.ts",
  }),
  name: Type.Optional(
    Type.String({
      description:
        "Symbol name in that file. Omit with line/column, or omit both to use the whole file.",
    }),
  ),
  line: Type.Optional(
    Type.Number({ description: "1-based line. Takes precedence over name when set." }),
  ),
  column: Type.Optional(
    Type.Number({ description: "1-based column. Defaults to 1 when line is set." }),
  ),
};

export function createAstTools(index: TypeScriptIndex) {
  return [
    defineTool({
      name: "list_source_files",
      label: "List source files",
      description: "List project-local TypeScript source files. Does not return file contents.",
      parameters: Type.Object({}),
      promptGuidelines: [
        "Do not read whole files. Use list_source_files to see project TypeScript files.",
      ],
      execute: async () => executeQuery(() => listSourceFiles(index)),
    }),
    defineTool({
      name: "search_symbols",
      label: "Search symbols",
      description: "Find TypeScript symbols by name. Returns file, name, kind, and position.",
      parameters: Type.Object({
        query: Type.String({ description: "Symbol name or substring to search for." }),
      }),
      promptGuidelines: ["Search by symbol name instead of grepping files."],
      execute: async (_toolCallId, params) =>
        executeQuery(() => searchSymbols(index, params.query)),
    }),
    defineTool({
      name: "outgoing_deps",
      label: "Outgoing deps",
      description:
        "Find project symbols that a node depends on. Pass file plus name, or file plus line.",
      parameters: Type.Object(locatorParameters),
      promptGuidelines: ["Use outgoing_deps to see what a symbol depends on."],
      execute: async (_toolCallId, params) =>
        executeQuery(() => outgoingDeps(index, toLocator(params))),
    }),
    defineTool({
      name: "incoming_deps",
      label: "Incoming deps",
      description:
        "Find project symbols that depend on a node. Pass file plus name, or file plus line.",
      parameters: Type.Object(locatorParameters),
      promptGuidelines: ["Use incoming_deps to see what depends on a symbol."],
      execute: async (_toolCallId, params) =>
        executeQuery(() => incomingDeps(index, toLocator(params))),
    }),
    defineTool({
      name: "get_source",
      label: "Get source",
      description: "Return the declaration source for one symbol. Never returns a whole file.",
      parameters: Type.Object(locatorParameters),
      promptGuidelines: ["Use get_source for one declaration. Never request a whole file."],
      execute: async (_toolCallId, params) =>
        executeQuery(() => getSource(index, toLocator(params))),
    }),
  ];
}

function executeQuery(run: () => unknown) {
  try {
    return toolResult(run());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toolResult({ error: message });
  }
}

function toLocator(params: {
  file: string;
  name?: string;
  line?: number;
  column?: number;
}): SymbolLocator {
  return {
    file: params.file,
    ...(params.name !== undefined ? { name: params.name } : {}),
    ...(params.line !== undefined ? { line: params.line } : {}),
    ...(params.column !== undefined ? { column: params.column } : {}),
  };
}

function toolResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: stringifyToolResult(value) }],
    details: {},
  };
}

function stringifyToolResult(value: unknown): string {
  try {
    return `${JSON.stringify(value, null, 2)}\n`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `${JSON.stringify({ error: message }, null, 2)}\n`;
  }
}
