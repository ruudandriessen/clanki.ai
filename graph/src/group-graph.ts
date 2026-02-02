import type { FileEdge, ClassificationResult, GroupEdge } from "./types.ts";

/**
 * Collapse a file-level import graph into a group-level dependency graph.
 *
 * For each file-level edge where the source and target belong to different
 * groups, a group-level edge is created (or updated). Intra-group edges are
 * dropped as internal implementation detail. Files that are unclassified are
 * silently skipped.
 *
 * @param fileEdges      - File-level import edges from Phase 1.
 * @param classification - Classification result from Phase 2.
 * @returns An array of {@link GroupEdge} records with deduplicated symbols.
 */
export function buildGroupGraph(
  fileEdges: FileEdge[],
  classification: ClassificationResult,
): GroupEdge[] {
  // Build lookup: absolute file path → group name
  const fileToGroup = new Map<string, string>();
  for (const c of classification.classifications) {
    fileToGroup.set(c.file, c.group);
  }

  // Accumulate group-level edges keyed by "from\0to"
  const edgeMap = new Map<string, { weight: number; symbols: Set<string> }>();

  for (const edge of fileEdges) {
    const fromGroup = fileToGroup.get(edge.from);
    const toGroup = fileToGroup.get(edge.to);

    // Skip if either file is unclassified
    if (!fromGroup || !toGroup) continue;

    // Drop intra-group edges
    if (fromGroup === toGroup) continue;

    const key = `${fromGroup}\0${toGroup}`;
    let entry = edgeMap.get(key);
    if (!entry) {
      entry = { weight: 0, symbols: new Set() };
      edgeMap.set(key, entry);
    }

    entry.weight++;
    for (const sym of edge.symbols) {
      entry.symbols.add(sym);
    }
  }

  // Convert to output format
  const result: GroupEdge[] = [];
  for (const [key, entry] of edgeMap) {
    const [from, to] = key.split("\0");
    result.push({
      from,
      to,
      weight: entry.weight,
      symbols: [...entry.symbols].toSorted(),
    });
  }

  // Sort for deterministic output: by from, then to
  result.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));

  return result;
}
