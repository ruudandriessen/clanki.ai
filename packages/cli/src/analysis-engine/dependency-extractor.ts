import path from "node:path";
import ts from "typescript";
import type { SourceFileDependencySummary } from "../functions/run/models/report";

export function collectSourceFileDependencies(
  program: ts.Program,
  projectDirectory: string,
  compilerOptions: ts.CompilerOptions,
): SourceFileDependencySummary[] {
  const sourceFiles = program
    .getSourceFiles()
    .filter((sourceFile: ts.SourceFile) => shouldAnalyzeSourceFile(program, sourceFile));
  const projectSourceFilePaths = new Set(
    sourceFiles.map((sourceFile) => path.resolve(sourceFile.fileName)),
  );
  const getCanonicalFileName = ts.sys.useCaseSensitiveFileNames
    ? (fileName: string): string => fileName
    : (fileName: string): string => fileName.toLowerCase();
  const moduleResolutionCache = ts.createModuleResolutionCache(
    projectDirectory,
    getCanonicalFileName,
    compilerOptions,
  );
  const dependenciesByFile = new Map<string, Set<string>>();

  for (const sourceFile of sourceFiles) {
    const fromFile = normalizePath(
      path.relative(projectDirectory, path.resolve(sourceFile.fileName)),
    );

    for (const moduleSpecifier of collectSourceFileModuleSpecifiers(sourceFile)) {
      const resolvedModule = ts.resolveModuleName(
        moduleSpecifier,
        sourceFile.fileName,
        compilerOptions,
        ts.sys,
        moduleResolutionCache,
      ).resolvedModule;

      if (!resolvedModule) {
        continue;
      }

      const resolvedPath = path.resolve(resolvedModule.resolvedFileName);

      if (!projectSourceFilePaths.has(resolvedPath)) {
        continue;
      }

      const toFile = normalizePath(path.relative(projectDirectory, resolvedPath));

      if (fromFile === toFile) {
        continue;
      }

      addSetEntry(dependenciesByFile, fromFile, toFile);
    }
  }

  const dependencies: SourceFileDependencySummary[] = [];

  for (const [fromFile, toFiles] of dependenciesByFile.entries()) {
    const sortedTargets = Array.from(toFiles).toSorted((left, right) => left.localeCompare(right));

    for (const toFile of sortedTargets) {
      dependencies.push({
        fromFile,
        toFile,
      });
    }
  }

  return dependencies.toSorted(
    (left, right) =>
      left.fromFile.localeCompare(right.fromFile) || left.toFile.localeCompare(right.toFile),
  );
}

function collectSourceFileModuleSpecifiers(sourceFile: ts.SourceFile): string[] {
  const moduleSpecifiers = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteralLike(statement.moduleSpecifier)) {
      moduleSpecifiers.add(statement.moduleSpecifier.text);
      continue;
    }

    if (
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier &&
      ts.isStringLiteralLike(statement.moduleSpecifier)
    ) {
      moduleSpecifiers.add(statement.moduleSpecifier.text);
      continue;
    }

    if (
      ts.isImportEqualsDeclaration(statement) &&
      ts.isExternalModuleReference(statement.moduleReference)
    ) {
      const expression = statement.moduleReference.expression;

      if (expression != null && ts.isStringLiteralLike(expression)) {
        moduleSpecifiers.add(expression.text);
      }
    }
  }

  return Array.from(moduleSpecifiers);
}

function normalizePath(value: string): string {
  return value.split(path.sep).join("/");
}

function addSetEntry(map: Map<string, Set<string>>, key: string, value: string): void {
  const existing = map.get(key);

  if (existing) {
    existing.add(value);
    return;
  }

  map.set(key, new Set([value]));
}

function shouldAnalyzeSourceFile(program: ts.Program, sourceFile: ts.SourceFile): boolean {
  return !sourceFile.isDeclarationFile && !program.isSourceFileFromExternalLibrary(sourceFile);
}
