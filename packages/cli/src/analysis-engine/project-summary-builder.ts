import path from "node:path";
import ts from "typescript";
import type { ProjectSummary } from "../functions/run/models/report";

export function buildProjectSummary(
  tsconfigPath: string,
  projectDirectory: string,
  fileNames: string[],
  options: ts.CompilerOptions,
): ProjectSummary {
  const sourceFiles = fileNames
    .map((fileName) => path.relative(projectDirectory, path.resolve(fileName)))
    .toSorted((left, right) => left.localeCompare(right));

  return {
    compilerOptions: {
      baseUrl:
        options.baseUrl != null && options.baseUrl.length > 0
          ? path.relative(projectDirectory, path.resolve(projectDirectory, options.baseUrl))
          : null,
      jsx: enumName(ts.JsxEmit, options.jsx),
      module: enumName(ts.ModuleKind, options.module),
      strict: Boolean(options.strict),
      target: enumName(ts.ScriptTarget, options.target),
      pathsDefined: Boolean(options.paths && Object.keys(options.paths).length > 0),
    },
    projectDirectory,
    sourceFileCount: sourceFiles.length,
    sourceFiles,
    tsconfigPath,
  };
}

function enumName<T extends Record<string, string | number>>(
  enumObject: T,
  value: number | undefined,
): string | null {
  if (value === undefined) {
    return null;
  }

  const name = enumObject[value];
  return typeof name === "string" ? name : null;
}
