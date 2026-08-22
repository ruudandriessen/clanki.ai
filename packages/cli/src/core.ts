import path from "node:path";
import type { ModelSummary } from "./functions/run/models/report";

export function resolveReferencedModels(
  referencedTypeName: string,
  modelsByName: Map<string, ModelSummary[]>,
): ModelSummary[] {
  const exactMatches = modelsByName.get(referencedTypeName);

  if (exactMatches && exactMatches.length > 0) {
    return exactMatches;
  }

  const lastSeparator = referencedTypeName.lastIndexOf(".");

  if (lastSeparator === -1 || lastSeparator === referencedTypeName.length - 1) {
    return [];
  }

  const simpleName = referencedTypeName.slice(lastSeparator + 1);
  return modelsByName.get(simpleName) ?? [];
}

export function compareModelsByLocation(left: ModelSummary, right: ModelSummary): number {
  return (
    left.location.file.localeCompare(right.location.file) ||
    left.location.line - right.location.line ||
    left.location.column - right.location.column ||
    left.name.localeCompare(right.name) ||
    left.kind.localeCompare(right.kind)
  );
}

export function normalizePath(value: string): string {
  return value.split(path.sep).join("/");
}

export function addSetEntry<K, V>(map: Map<K, Set<V>>, key: K, value: V): void {
  const existing = map.get(key);

  if (existing) {
    existing.add(value);
    return;
  }

  map.set(key, new Set([value]));
}
