export interface SourceFileDependency {
  fromFile: string;
  toFile: string;
}

export interface DependencyGraph {
  tsconfigPath: string;
  projectDirectory: string;
  files: string[];
  edges: SourceFileDependency[];
}
