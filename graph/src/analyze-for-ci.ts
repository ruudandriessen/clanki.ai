#!/usr/bin/env bun
import path from "path";
import fs from "fs";
import { extractFileGraph } from "./extract.ts";
import { loadGroupConfig } from "./config.ts";
import { classifyFiles } from "./classify.ts";
import { buildGroupGraph } from "./group-graph.ts";

function parseArgs(args: string[]): { projectRoot: string; groupsConfig?: string } {
  let projectRoot = process.cwd();
  let groupsConfig: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--project-root" && args[i + 1]) {
      projectRoot = path.resolve(args[++i]);
    } else if (args[i] === "--groups-config" && args[i + 1]) {
      groupsConfig = path.resolve(args[++i]);
    }
  }

  return { projectRoot, groupsConfig };
}

function findGroupsConfig(projectRoot: string): string | null {
  for (const name of ["groups.yml", "clanki.yml"]) {
    const p = path.join(projectRoot, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function findTsconfigs(projectRoot: string): string[] {
  const entries = fs.readdirSync(projectRoot);
  return entries
    .filter((e) => /^tsconfig(\..+)?\.json$/.test(e))
    .map((e) => path.join(projectRoot, e));
}

const { projectRoot, groupsConfig } = parseArgs(process.argv.slice(2));

// Resolve groups config
const configPath = groupsConfig ?? findGroupsConfig(projectRoot);
if (!configPath) {
  console.error("No groups.yml or clanki.yml found in project root. Provide --groups-config.");
  process.exit(1);
}

const config = loadGroupConfig(configPath);

// Find and process tsconfigs
const tsconfigs = findTsconfigs(projectRoot);
if (tsconfigs.length === 0) {
  console.error("No tsconfig*.json files found in project root.");
  process.exit(1);
}

const allEdges = [];
for (const tsconfigPath of tsconfigs) {
  const name = path.basename(tsconfigPath);
  console.error(`Extracting from ${name}...`);
  const edges = extractFileGraph(tsconfigPath);
  console.error(`  ${edges.length} edges`);
  allEdges.push(...edges);
}

// Collect all unique file paths
const allFiles = new Set<string>();
for (const edge of allEdges) {
  allFiles.add(edge.from);
  allFiles.add(edge.to);
}
console.error(`${allFiles.size} unique files across all programs`);

// Classify (no caching in CI)
const classification = classifyFiles([...allFiles], config, { projectRoot });

// Build group graph
const groupEdges = buildGroupGraph(allEdges, classification);

// Strip absolute paths to relative
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

// Output JSON to stdout (progress logs go to stderr)
console.log(JSON.stringify(output));
