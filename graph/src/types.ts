/**
 * Represents a single import relationship between two source files.
 */
export interface FileEdge {
  /** Absolute path of the importing file. */
  from: string;
  /** Absolute path of the imported file. */
  to: string;
  /** Named imports crossing this edge (e.g. ["createUser", "UserSchema"]). */
  symbols: string[];
}

// ---------------------------------------------------------------------------
// Phase 2: Group Configuration and Heuristic Classification
// ---------------------------------------------------------------------------

/**
 * A user-defined semantic group that source files can be classified into.
 */
export interface GroupDefinition {
  /** Human-readable group name (e.g. "UI Components"). */
  name: string;
  /** Describes what belongs in this group. Used by heuristics and LLM. */
  description: string;
}

/**
 * Pins a file glob pattern to a specific group. Overrides take priority
 * over heuristic classification.
 */
export interface GroupOverride {
  /** Glob pattern matched against the file path relative to the project root. */
  pattern: string;
  /** Name of the group to assign. Must reference a defined group. */
  group: string;
}

/**
 * Full group configuration loaded from a YAML file.
 */
export interface GroupConfig {
  groups: GroupDefinition[];
  overrides?: GroupOverride[];
}

/**
 * How a file was assigned to its group.
 *
 * - `override`  — matched a user-defined glob override
 * - `heuristic` — matched a built-in heuristic rule
 * - `default`   — fell back to the first group (lowest confidence)
 */
export type ClassificationStrategy = "override" | "heuristic" | "default";

/**
 * The classification result for a single source file.
 */
export interface FileClassification {
  /** Absolute path of the classified file. */
  file: string;
  /** Name of the assigned group. */
  group: string;
  /** How the assignment was determined. */
  strategy: ClassificationStrategy;
}

/**
 * Aggregated classification output for an entire project.
 */
export interface ClassificationResult {
  /** Files that were successfully classified into a group. */
  classifications: FileClassification[];
  /** Absolute paths of files that no heuristic could confidently classify. */
  unclassified: string[];
}

// ---------------------------------------------------------------------------
// Phase 3: Group-Level Dependency Graph
// ---------------------------------------------------------------------------

/**
 * A directed edge between two groups in the collapsed dependency graph.
 *
 * Created by aggregating file-level edges: for each {@link FileEdge} where
 * `group(from) ≠ group(to)`, the corresponding group edge is incremented.
 */
export interface GroupEdge {
  /** Name of the group that contains the importing file. */
  from: string;
  /** Name of the group that contains the imported file. */
  to: string;
  /** Number of file-level edges contributing to this group edge. */
  weight: number;
  /** Deduplicated symbols crossing this group boundary. */
  symbols: string[];
}
