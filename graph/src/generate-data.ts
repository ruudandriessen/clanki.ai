#!/usr/bin/env bun
import path from "path";
import fs from "fs";
import { extractFileGraph } from "./extract.ts";
import { loadGroupConfig } from "./config.ts";
import { classifyFiles } from "./classify.ts";
import { buildGroupGraph } from "./group-graph.ts";

const projectRoot = path.resolve(import.meta.dir, "../..");

// Load group config
const config = loadGroupConfig(path.join(projectRoot, "groups.yml"));

// Extract file edges from all tsconfigs
const tsconfigs = ["tsconfig.frontend.json", "tsconfig.worker.json", "tsconfig.graph.json"];

const allEdges = [];
for (const tsconfig of tsconfigs) {
  const tsconfigPath = path.join(projectRoot, tsconfig);
  console.log(`Extracting from ${tsconfig}...`);
  const edges = extractFileGraph(tsconfigPath);
  console.log(`  ${edges.length} edges`);
  allEdges.push(...edges);
}

// Collect all unique file paths from edges
const allFiles = new Set<string>();
for (const edge of allEdges) {
  allFiles.add(edge.from);
  allFiles.add(edge.to);
}
console.log(`\n${allFiles.size} unique files across all programs`);

// Classify files
const classification = classifyFiles([...allFiles], config, { projectRoot });

// Build group graph
const groupEdges = buildGroupGraph(allEdges, classification);

// Strip absolute paths to relative for portability
const stripAbs = (p: string) => path.relative(projectRoot, p);

const output = {
  groups: config.groups,
  fileEdges: allEdges.map((e) => ({
    from: stripAbs(e.from),
    to: stripAbs(e.to),
    symbols: e.symbols,
  })),
  classifications: classification.classifications.map((c) => ({
    file: stripAbs(c.file),
    group: c.group,
    strategy: c.strategy,
  })),
  unclassified: classification.unclassified.map(stripAbs),
  groupEdges,
};

// Write to frontend public dir
const outputDir = path.join(projectRoot, "frontend", "public");
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "graph-data.json"), JSON.stringify(output, null, 2));

console.log(`\nGenerated frontend/public/graph-data.json`);
console.log(`  ${output.fileEdges.length} file edges`);
console.log(`  ${output.classifications.length} classified files`);
console.log(`  ${output.unclassified.length} unclassified files`);
console.log(`  ${output.groupEdges.length} group edges`);
