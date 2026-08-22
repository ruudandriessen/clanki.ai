import path from "node:path";
import ts from "typescript";
import type {
  ModelSummary,
  SourceLocation,
  ModelMemberSummary,
} from "../functions/run/models/report";

export function collectModels(program: ts.Program, projectDirectory: string): ModelSummary[] {
  const checker = program.getTypeChecker();
  const models: ModelSummary[] = [];
  const sourceFiles = program
    .getSourceFiles()
    .filter((sourceFile: ts.SourceFile) => shouldAnalyzeSourceFile(program, sourceFile))
    .toSorted((left: ts.SourceFile, right: ts.SourceFile) =>
      left.fileName.localeCompare(right.fileName),
    );

  for (const sourceFile of sourceFiles) {
    const exportInfo = collectSourceFileExportInfo(sourceFile);

    for (const statement of sourceFile.statements) {
      if (!isSupportedModelDeclaration(statement)) {
        continue;
      }

      const model = buildModelSummary(statement, checker, projectDirectory, exportInfo);

      if (model) {
        models.push(model);
      }
    }
  }

  return models.toSorted(compareModels);
}

type SupportedModelDeclaration =
  | ts.InterfaceDeclaration
  | ts.TypeAliasDeclaration
  | ts.ClassDeclaration
  | ts.EnumDeclaration;

function isSupportedModelDeclaration(node: ts.Node): node is SupportedModelDeclaration {
  return (
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isEnumDeclaration(node)
  );
}

interface SourceFileExportInfo {
  defaultExportNames: Set<string>;
  exportedNames: Set<string>;
}

function collectSourceFileExportInfo(sourceFile: ts.SourceFile): SourceFileExportInfo {
  const exportedNames = new Set<string>();
  const defaultExportNames = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (isSupportedModelDeclaration(statement)) {
      const name = statement.name?.text;

      if (name == null || name.length === 0) {
        continue;
      }

      if (hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
        exportedNames.add(name);
      }

      if (hasModifier(statement, ts.SyntaxKind.DefaultKeyword)) {
        defaultExportNames.add(name);
      }
    }

    if (ts.isExportDeclaration(statement) && !statement.moduleSpecifier && statement.exportClause) {
      if (!ts.isNamedExports(statement.exportClause)) {
        continue;
      }

      for (const element of statement.exportClause.elements) {
        const localName = element.propertyName?.text ?? element.name.text;
        exportedNames.add(localName);

        if (element.name.text === "default") {
          defaultExportNames.add(localName);
        }
      }
    }

    if (ts.isExportAssignment(statement) && ts.isIdentifier(statement.expression)) {
      exportedNames.add(statement.expression.text);

      if (statement.isExportEquals !== true) {
        defaultExportNames.add(statement.expression.text);
      }
    }
  }

  return {
    defaultExportNames,
    exportedNames,
  };
}

function buildModelSummary(
  declaration: SupportedModelDeclaration,
  checker: ts.TypeChecker,
  projectDirectory: string,
  exportInfo: SourceFileExportInfo,
): ModelSummary | null {
  const name =
    declaration.name?.text ??
    (hasModifier(declaration, ts.SyntaxKind.DefaultKeyword) ? "default" : null);

  if (name == null || name.length === 0) {
    return null;
  }

  const isExported =
    hasModifier(declaration, ts.SyntaxKind.ExportKeyword) || exportInfo.exportedNames.has(name);

  if (!isExported) {
    return null;
  }

  const location = getSourceLocation(declaration.name ?? declaration, projectDirectory);

  return {
    id: `${location.file}:${location.line}:${location.column}:${name}`,
    kind: getModelKind(declaration),
    name,
    location,
    isDefaultExport:
      hasModifier(declaration, ts.SyntaxKind.DefaultKeyword) ||
      exportInfo.defaultExportNames.has(name),
    isExported,
    jsDocSummary: getJsDocSummary(declaration, checker),
    members: getModelMembers(declaration),
    referencedTypeNames: collectReferencedTypeNames(declaration),
    sourceText: declaration.getText(),
  };
}

function getSourceLocation(node: ts.Node, projectDirectory: string): SourceLocation {
  const sourceFile = node.getSourceFile();
  const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));

  return {
    file: path.relative(projectDirectory, path.resolve(sourceFile.fileName)),
    line: location.line + 1,
    column: location.character + 1,
  };
}

function getModelKind(declaration: SupportedModelDeclaration): ModelSummary["kind"] {
  if (ts.isInterfaceDeclaration(declaration)) {
    return "interface";
  }

  if (ts.isTypeAliasDeclaration(declaration)) {
    return "type";
  }

  if (ts.isClassDeclaration(declaration)) {
    return "class";
  }

  return "enum";
}

function getJsDocSummary(
  declaration: SupportedModelDeclaration,
  checker: ts.TypeChecker,
): string | null {
  const symbol = declaration.name
    ? checker.getSymbolAtLocation(declaration.name)
    : checker.getSymbolAtLocation(declaration);
  const summary = symbol
    ? ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim()
    : "";
  return summary.length > 0 ? summary : null;
}

function getModelMembers(declaration: SupportedModelDeclaration): ModelMemberSummary[] {
  if (ts.isInterfaceDeclaration(declaration)) {
    return declaration.members.map((member: ts.TypeElement) => summarizeTypeElement(member));
  }

  if (ts.isTypeAliasDeclaration(declaration)) {
    return ts.isTypeLiteralNode(declaration.type)
      ? declaration.type.members.map((member: ts.TypeElement) => summarizeTypeElement(member))
      : [];
  }

  if (ts.isClassDeclaration(declaration)) {
    return declaration.members.map((member: ts.ClassElement) => summarizeClassElement(member));
  }

  return declaration.members.map((member: ts.EnumMember) => ({
    kind: "enumMember",
    name: member.name.getText(),
  }));
}

function summarizeTypeElement(member: ts.TypeElement): ModelMemberSummary {
  if (ts.isPropertySignature(member)) {
    return { kind: "property", name: getPropertyNameText(member.name) };
  }

  if (ts.isMethodSignature(member)) {
    return { kind: "method", name: getPropertyNameText(member.name) };
  }

  if (ts.isIndexSignatureDeclaration(member)) {
    return { kind: "indexSignature", name: "[index]" };
  }

  if (ts.isCallSignatureDeclaration(member)) {
    return { kind: "callSignature", name: "(call)" };
  }

  if (ts.isConstructSignatureDeclaration(member)) {
    return { kind: "constructSignature", name: "(construct)" };
  }

  if (ts.isGetAccessorDeclaration(member)) {
    return { kind: "getter", name: getPropertyNameText(member.name) };
  }

  if (ts.isSetAccessorDeclaration(member)) {
    return { kind: "setter", name: getPropertyNameText(member.name) };
  }

  return { kind: "unknown", name: member.getText() };
}

function summarizeClassElement(member: ts.ClassElement): ModelMemberSummary {
  if (ts.isConstructorDeclaration(member)) {
    return { kind: "constructor", name: "constructor" };
  }

  if (ts.isPropertyDeclaration(member)) {
    return { kind: "property", name: getPropertyNameText(member.name) };
  }

  if (ts.isMethodDeclaration(member)) {
    return { kind: "method", name: getPropertyNameText(member.name) };
  }

  if (ts.isGetAccessorDeclaration(member)) {
    return { kind: "getter", name: getPropertyNameText(member.name) };
  }

  if (ts.isSetAccessorDeclaration(member)) {
    return { kind: "setter", name: getPropertyNameText(member.name) };
  }

  if (ts.isIndexSignatureDeclaration(member)) {
    return { kind: "indexSignature", name: "[index]" };
  }

  if (ts.isSemicolonClassElement(member)) {
    return { kind: "field", name: ";" };
  }

  return { kind: "unknown", name: member.getText() };
}

function getPropertyNameText(name: ts.PropertyName | ts.PrivateIdentifier | undefined): string {
  if (!name) {
    return "(anonymous)";
  }

  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name) ||
    ts.isPrivateIdentifier(name)
  ) {
    return name.text;
  }

  if (ts.isComputedPropertyName(name)) {
    return `[${name.expression.getText()}]`;
  }

  return name.getText();
}

function collectReferencedTypeNames(declaration: SupportedModelDeclaration): string[] {
  const referencedTypeNames = new Set<string>();

  const visit = (node: ts.Node): void => {
    if (ts.isTypeReferenceNode(node)) {
      referencedTypeNames.add(getEntityNameText(node.typeName));
    } else if (ts.isExpressionWithTypeArguments(node)) {
      referencedTypeNames.add(getExpressionNameText(node.expression));
    } else if (ts.isImportTypeNode(node) && node.qualifier) {
      referencedTypeNames.add(getEntityNameText(node.qualifier));
    }

    ts.forEachChild(node, visit);
  };

  visit(declaration);

  return Array.from(referencedTypeNames).toSorted((left, right) => left.localeCompare(right));
}

function getEntityNameText(name: ts.EntityName): string {
  return ts.isIdentifier(name) ? name.text : `${getEntityNameText(name.left)}.${name.right.text}`;
}

function getExpressionNameText(expression: ts.Expression): string {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }

  if (ts.isPropertyAccessExpression(expression)) {
    return `${getExpressionNameText(expression.expression)}.${expression.name.text}`;
  }

  return expression.getText();
}

function compareModels(left: ModelSummary, right: ModelSummary): number {
  return (
    left.location.file.localeCompare(right.location.file) ||
    left.location.line - right.location.line ||
    left.location.column - right.location.column ||
    left.name.localeCompare(right.name) ||
    left.kind.localeCompare(right.kind)
  );
}

function shouldAnalyzeSourceFile(program: ts.Program, sourceFile: ts.SourceFile): boolean {
  return !sourceFile.isDeclarationFile && !program.isSourceFileFromExternalLibrary(sourceFile);
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return modifiers?.some((modifier: ts.Modifier) => modifier.kind === kind) ?? false;
}
