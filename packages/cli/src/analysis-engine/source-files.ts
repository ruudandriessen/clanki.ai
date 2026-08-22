import path from "node:path";
import ts from "typescript";

export function shouldAnalyzeSourceFile(program: ts.Program, sourceFile: ts.SourceFile): boolean {
  return !sourceFile.isDeclarationFile && !program.isSourceFileFromExternalLibrary(sourceFile);
}

export function toProjectRelativePath(fileName: string, projectDirectory: string): string {
  return path.relative(projectDirectory, path.resolve(fileName)).split(path.sep).join("/");
}

export function collectProjectSourceFiles(program: ts.Program, projectDirectory: string): string[] {
  return program
    .getSourceFiles()
    .filter((sourceFile) => shouldAnalyzeSourceFile(program, sourceFile))
    .map((sourceFile) => toProjectRelativePath(sourceFile.fileName, projectDirectory))
    .toSorted((left, right) => left.localeCompare(right));
}
