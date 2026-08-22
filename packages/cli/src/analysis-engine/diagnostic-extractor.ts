import path from "node:path";
import ts from "typescript";
import type { DiagnosticSummary } from "../functions/run/models/report";

export function collectDiagnostics(
  program: ts.Program,
  configDiagnostics: readonly ts.Diagnostic[],
  projectDirectory: string,
): DiagnosticSummary[] {
  const diagnostics = [...configDiagnostics, ...ts.getPreEmitDiagnostics(program)];

  return diagnostics
    .map((diagnostic) => toDiagnosticSummary(diagnostic, projectDirectory))
    .toSorted((left, right) => compareDiagnostics(left, right));
}

function toDiagnosticSummary(
  diagnostic: ts.Diagnostic,
  projectDirectory: string,
): DiagnosticSummary {
  const category = ts.DiagnosticCategory[diagnostic.category].toLowerCase();
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");

  if (!diagnostic.file || diagnostic.start === undefined) {
    return {
      category,
      code: diagnostic.code,
      message,
      file: null,
      line: null,
      column: null,
    };
  }

  const location = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);

  return {
    category,
    code: diagnostic.code,
    message,
    file: path.relative(projectDirectory, path.resolve(diagnostic.file.fileName)),
    line: location.line + 1,
    column: location.character + 1,
  };
}

function compareDiagnostics(left: DiagnosticSummary, right: DiagnosticSummary): number {
  return (
    compareNullableStrings(left.file, right.file) ||
    compareNullableNumbers(left.line, right.line) ||
    compareNullableNumbers(left.column, right.column) ||
    left.code - right.code ||
    left.message.localeCompare(right.message)
  );
}

function compareNullableNumbers(left: number | null, right: number | null): number {
  if (left === right) {
    return 0;
  }

  if (left === null) {
    return -1;
  }

  if (right === null) {
    return 1;
  }

  return left - right;
}

function compareNullableStrings(left: string | null, right: string | null): number {
  if (left === right) {
    return 0;
  }

  if (left === null) {
    return -1;
  }

  if (right === null) {
    return 1;
  }

  return left.localeCompare(right);
}
