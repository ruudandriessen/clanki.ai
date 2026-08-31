import path from "node:path";
import ts from "typescript";

export interface SymbolRef {
  file: string;
  name: string;
  kind: string;
  line: number;
  column: number;
}

export interface SymbolLocator {
  file: string;
  name?: string;
  line?: number;
  column?: number;
}

export interface TypeScriptIndex {
  projectDirectory: string;
  tsconfigPath: string;
  program: ts.Program;
  languageService: ts.LanguageService;
  dispose: () => void;
}

export function createTypeScriptIndex(tsconfigPath: string): TypeScriptIndex {
  const resolvedTsconfigPath = path.resolve(tsconfigPath);
  const projectDirectory = path.dirname(resolvedTsconfigPath);
  const configResult = ts.readConfigFile(resolvedTsconfigPath, (fileName) =>
    ts.sys.readFile(fileName),
  );

  if (configResult.error) {
    throw new Error(formatDiagnostic(configResult.error));
  }

  const parsedConfig = ts.parseJsonConfigFileContent(
    configResult.config,
    ts.sys,
    projectDirectory,
    undefined,
    resolvedTsconfigPath,
  );

  const host: ts.LanguageServiceHost = {
    getCompilationSettings: () => parsedConfig.options,
    getScriptFileNames: () => parsedConfig.fileNames,
    getScriptVersion: () => "1",
    getScriptSnapshot: (fileName) => {
      const text = ts.sys.readFile(fileName);
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
    },
    getCurrentDirectory: () => projectDirectory,
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    fileExists: (fileName) => ts.sys.fileExists(fileName),
    readFile: (fileName) => ts.sys.readFile(fileName),
    readDirectory: (pathName, extensions, exclude, include, depth) =>
      ts.sys.readDirectory(pathName, extensions, exclude, include, depth),
    directoryExists: (dirName) => ts.sys.directoryExists(dirName),
    getDirectories: (dirName) => ts.sys.getDirectories(dirName),
  };

  const languageService = ts.createLanguageService(host, ts.createDocumentRegistry());
  const program = languageService.getProgram();

  if (!program) {
    languageService.dispose();
    throw new Error(`Failed to create a TypeScript program from ${resolvedTsconfigPath}`);
  }

  return {
    projectDirectory,
    tsconfigPath: resolvedTsconfigPath,
    program,
    languageService,
    dispose: () => {
      languageService.dispose();
    },
  };
}

export function toProjectRelativePath(fileName: string, projectDirectory: string): string {
  return path.relative(projectDirectory, path.resolve(fileName)).split(path.sep).join("/");
}

export function isProjectSourceFile(program: ts.Program, sourceFile: ts.SourceFile): boolean {
  return !sourceFile.isDeclarationFile && !program.isSourceFileFromExternalLibrary(sourceFile);
}

function resolveSourceFile(index: TypeScriptIndex, file: string): ts.SourceFile {
  const requested = file.split(path.sep).join("/");
  const absolutePath = path.isAbsolute(file)
    ? path.resolve(file)
    : path.resolve(index.projectDirectory, file);
  const sourceFile =
    index.program.getSourceFile(absolutePath) ??
    index.program.getSourceFiles().find((candidate) => {
      return toProjectRelativePath(candidate.fileName, index.projectDirectory) === requested;
    });

  if (!sourceFile || !isProjectSourceFile(index.program, sourceFile)) {
    throw new Error(`Source file not found in the TypeScript project: ${file}`);
  }

  return sourceFile;
}

export function resolveLocator(
  index: TypeScriptIndex,
  locator: SymbolLocator,
): {
  sourceFile: ts.SourceFile;
  node: ts.Node;
  position: number;
  symbol: SymbolRef;
} {
  const sourceFile = resolveSourceFile(index, locator.file);
  const node = resolveLocatorNode(index, sourceFile, locator);
  const position = declarationNamePosition(node);
  const symbol = toSymbolRef(index, node);

  return { sourceFile, node, position, symbol };
}

export function toSymbolRef(index: TypeScriptIndex, node: ts.Node): SymbolRef {
  const sourceFile = node.getSourceFile();
  const position = declarationNamePosition(node);
  const location = sourceFile.getLineAndCharacterOfPosition(position);
  const named = asNamedDeclaration(node);

  return {
    file: toProjectRelativePath(sourceFile.fileName, index.projectDirectory),
    name: named?.name && ts.isIdentifier(named.name) ? named.name.text : sourceFileName(sourceFile),
    kind: declarationKind(node),
    line: location.line + 1,
    column: location.character + 1,
  };
}

function declarationNamePosition(node: ts.Node): number {
  const named = asNamedDeclaration(node);

  if (named?.name) {
    return named.name.getStart();
  }

  return node.getStart();
}

export function getEnclosingDeclaration(node: ts.Node): ts.Node {
  let current: ts.Node | undefined = node;

  while (current) {
    if (isUsageContainer(current) || ts.isSourceFile(current)) {
      return current;
    }

    current = current.parent;
  }

  return node.getSourceFile();
}

export function isDeclarationContainer(node: ts.Node): boolean {
  return isUsageContainer(node) || ts.isVariableDeclaration(node);
}

function isUsageContainer(node: ts.Node): boolean {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node) ||
    ts.isModuleDeclaration(node)
  );
}

function resolveLocatorNode(
  index: TypeScriptIndex,
  sourceFile: ts.SourceFile,
  locator: SymbolLocator,
): ts.Node {
  if (locator.line !== undefined) {
    const position = ts.getPositionOfLineAndCharacter(
      sourceFile,
      locator.line - 1,
      (locator.column ?? 1) - 1,
    );
    const node = getNodeAtPosition(sourceFile, position);
    return getEnclosingDeclaration(node);
  }

  if (locator.name !== undefined && locator.name.length > 0) {
    const declaration = findDeclarationByName(index, sourceFile, locator.name);

    if (!declaration) {
      throw new Error(`Symbol "${locator.name}" was not found in ${locator.file}`);
    }

    return declaration;
  }

  return sourceFile;
}

function findDeclarationByName(
  index: TypeScriptIndex,
  sourceFile: ts.SourceFile,
  name: string,
): ts.Node | undefined {
  const checker = index.program.getTypeChecker();
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  const exported = moduleSymbol
    ? checker.getExportsOfModule(moduleSymbol).find((symbol) => symbol.getName() === name)
    : undefined;
  const exportedDeclaration = exported?.getDeclarations()?.find((declaration) => {
    return declaration.getSourceFile() === sourceFile;
  });

  if (exportedDeclaration) {
    return exportedDeclaration;
  }

  let match: ts.Node | undefined;

  const visit = (node: ts.Node): void => {
    if (match) {
      return;
    }

    const named = asNamedDeclaration(node);

    if (named?.name && ts.isIdentifier(named.name) && named.name.text === name) {
      match = node;
      return;
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return match;
}

export function getNodeAtPosition(sourceFile: ts.SourceFile, position: number): ts.Node {
  const visit = (node: ts.Node): ts.Node => {
    for (const child of node.getChildren(sourceFile)) {
      if (child.pos <= position && position < child.end) {
        return visit(child);
      }
    }

    return node;
  };

  return visit(sourceFile);
}

function asNamedDeclaration(node: ts.Node): ts.NamedDeclaration | undefined {
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node) ||
    ts.isVariableDeclaration(node) ||
    ts.isModuleDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isPropertyDeclaration(node) ||
    ts.isPropertySignature(node)
  ) {
    return node;
  }

  return undefined;
}

function declarationKind(node: ts.Node): string {
  if (ts.isSourceFile(node)) {
    return "file";
  }

  if (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node)
  ) {
    return "function";
  }

  if (ts.isClassDeclaration(node)) {
    return "class";
  }

  if (ts.isInterfaceDeclaration(node)) {
    return "interface";
  }

  if (ts.isTypeAliasDeclaration(node)) {
    return "type";
  }

  if (ts.isEnumDeclaration(node)) {
    return "enum";
  }

  if (ts.isVariableDeclaration(node)) {
    return "variable";
  }

  if (ts.isModuleDeclaration(node)) {
    return "module";
  }

  if (ts.isPropertySignature(node) || ts.isPropertyDeclaration(node)) {
    return "property";
  }

  return "symbol";
}

function sourceFileName(sourceFile: ts.SourceFile): string {
  const baseName = sourceFile.fileName.split(/[/\\]/u).at(-1);
  return baseName ?? sourceFile.fileName;
}

function formatDiagnostic(diagnostic: ts.Diagnostic): string {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
}
