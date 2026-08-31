import ts from "typescript";

import {
  getEnclosingDeclaration,
  getNodeAtPosition,
  isDeclarationContainer,
  isProjectSourceFile,
  resolveLocator,
  toProjectRelativePath,
  toSymbolRef,
  type SymbolLocator,
  type SymbolRef,
  type TypeScriptIndex,
} from "./typescript-index";

const MAX_SEARCH_RESULTS = 40;
const MAX_DEPENDENCY_RESULTS = 100;
const MAX_SOURCE_CHARS = 8000;

export function listSourceFiles(index: TypeScriptIndex): string[] {
  return index.program
    .getSourceFiles()
    .filter((sourceFile) => isProjectSourceFile(index.program, sourceFile))
    .map((sourceFile) => toProjectRelativePath(sourceFile.fileName, index.projectDirectory))
    .toSorted((left, right) => left.localeCompare(right));
}

export function searchSymbols(index: TypeScriptIndex, query: string): SymbolRef[] {
  const items = index.languageService.getNavigateToItems(query, MAX_SEARCH_RESULTS);
  const results: SymbolRef[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const sourceFile = index.program.getSourceFile(item.fileName);

    if (!sourceFile || !isProjectSourceFile(index.program, sourceFile)) {
      continue;
    }

    const location = sourceFile.getLineAndCharacterOfPosition(item.textSpan.start);
    const symbol: SymbolRef = {
      file: toProjectRelativePath(sourceFile.fileName, index.projectDirectory),
      name: item.name,
      kind: item.kind,
      line: location.line + 1,
      column: location.character + 1,
    };
    const key = symbolKey(symbol);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    results.push(symbol);
  }

  return results.toSorted(compareSymbolRefs);
}

export function outgoingDeps(index: TypeScriptIndex, locator: SymbolLocator): SymbolRef[] {
  const { node } = resolveLocator(index, locator);
  const checker = index.program.getTypeChecker();
  const seen = new Set<string>();
  const results: SymbolRef[] = [];

  const visit = (current: ts.Node): void => {
    if (ts.isIdentifier(current)) {
      addOutgoingIdentifier(index, checker, node, current, seen, results);
    }

    ts.forEachChild(current, visit);
  };

  visit(node);
  return results.toSorted(compareSymbolRefs).slice(0, MAX_DEPENDENCY_RESULTS);
}

export function incomingDeps(index: TypeScriptIndex, locator: SymbolLocator): SymbolRef[] {
  const { sourceFile, position } = resolveLocator(index, locator);
  const references = index.languageService.findReferences(sourceFile.fileName, position) ?? [];
  const seen = new Set<string>();
  const results: SymbolRef[] = [];

  for (const group of references) {
    for (const reference of group.references) {
      if (reference.isDefinition) {
        continue;
      }

      const referenceFile = index.program.getSourceFile(reference.fileName);

      if (!referenceFile || !isProjectSourceFile(index.program, referenceFile)) {
        continue;
      }

      const referenceNode = getNodeAtPosition(referenceFile, reference.textSpan.start);

      if (isInsideImport(referenceNode)) {
        continue;
      }

      const node = getEnclosingDeclaration(referenceNode);

      if (ts.isSourceFile(node) && node.fileName === sourceFile.fileName) {
        continue;
      }

      const symbol = toSymbolRef(index, node);
      const key = symbolKey(symbol);

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      results.push(symbol);
    }
  }

  return results.toSorted(compareSymbolRefs).slice(0, MAX_DEPENDENCY_RESULTS);
}

export function getSource(
  index: TypeScriptIndex,
  locator: SymbolLocator,
): {
  symbol: SymbolRef;
  text: string;
} {
  const { node, symbol } = resolveLocator(index, locator);
  const text = node.getFullText().trim();

  return {
    symbol,
    text: text.length > MAX_SOURCE_CHARS ? `${text.slice(0, MAX_SOURCE_CHARS - 3)}...` : text,
  };
}

function addOutgoingIdentifier(
  index: TypeScriptIndex,
  checker: ts.TypeChecker,
  container: ts.Node,
  identifier: ts.Identifier,
  seen: Set<string>,
  results: SymbolRef[],
): void {
  let symbol = checker.getSymbolAtLocation(identifier);

  if (!symbol) {
    return;
  }

  if (symbol.flags & ts.SymbolFlags.Alias) {
    symbol = checker.getAliasedSymbol(symbol);
  }

  const declaration = symbol.getDeclarations()?.find((candidate) => {
    const sourceFile = candidate.getSourceFile();
    return isProjectSourceFile(index.program, sourceFile);
  });

  if (!declaration) {
    return;
  }

  if (declaration === container || isNodeInside(declaration, container)) {
    return;
  }

  const resolved = isDeclarationContainer(declaration)
    ? declaration
    : getEnclosingDeclaration(declaration);
  const ref = toSymbolRef(index, resolved);
  const key = symbolKey(ref);

  if (seen.has(key)) {
    return;
  }

  seen.add(key);
  results.push(ref);
}

function isInsideImport(node: ts.Node): boolean {
  let current: ts.Node | undefined = node;

  while (current) {
    if (
      ts.isImportDeclaration(current) ||
      ts.isImportEqualsDeclaration(current) ||
      ts.isExportDeclaration(current)
    ) {
      return true;
    }

    current = current.parent;
  }

  return false;
}

function isNodeInside(node: ts.Node, container: ts.Node): boolean {
  let current: ts.Node | undefined = node;

  while (current) {
    if (current === container) {
      return true;
    }

    current = current.parent;
  }

  return false;
}

function symbolKey(symbol: SymbolRef): string {
  return `${symbol.file}:${symbol.name}:${symbol.line}:${symbol.column}`;
}

function compareSymbolRefs(left: SymbolRef, right: SymbolRef): number {
  return (
    left.file.localeCompare(right.file) ||
    left.name.localeCompare(right.name) ||
    left.line - right.line ||
    left.column - right.column
  );
}
