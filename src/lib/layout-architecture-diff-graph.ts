import type {
  ArchitectureDiff,
  ArchitectureDiffEdge,
  ArchitectureDiffFile,
} from "@clanki/protocol";

const NODE_WIDTH = 188;
const NODE_HEIGHT = 44;
const COLUMN_GAP = 64;
const ROW_GAP = 14;
const PADDING_X = 24;
const PADDING_Y = 20;
const HEADER_HEIGHT = 24;

export type ArchitectureGraphNodeLayout = {
  directory: string;
  file: string;
  height: number;
  label: string;
  status: ArchitectureDiffFile["status"];
  width: number;
  x: number;
  y: number;
};

export type ArchitectureGraphColumnLayout = {
  directory: string;
  x: number;
  y: number;
  width: number;
};

export type ArchitectureGraphEdgeLayout = {
  d: string;
  fromFile: string;
  status: ArchitectureDiffEdge["status"];
  toFile: string;
};

export type ArchitectureGraphLayout = {
  columns: ArchitectureGraphColumnLayout[];
  edges: ArchitectureGraphEdgeLayout[];
  height: number;
  nodes: ArchitectureGraphNodeLayout[];
  width: number;
};

export function layoutArchitectureDiffGraph(diff: ArchitectureDiff): ArchitectureGraphLayout {
  const filesByDirectory = new Map<string, ArchitectureDiffFile[]>();

  for (const file of diff.files) {
    const directory = fileDirectory(file.file);
    const files = filesByDirectory.get(directory);

    if (files) {
      files.push(file);
      continue;
    }

    filesByDirectory.set(directory, [file]);
  }

  const directoryEntries = Array.from(filesByDirectory.entries()).toSorted(([left], [right]) =>
    left.localeCompare(right),
  );
  const columns: ArchitectureGraphColumnLayout[] = [];
  const nodes: ArchitectureGraphNodeLayout[] = [];
  const nodesByFile = new Map<string, ArchitectureGraphNodeLayout>();

  directoryEntries.forEach(([directory, files], columnIndex) => {
    const sortedFiles = files.toSorted((left, right) => left.file.localeCompare(right.file));
    const x = PADDING_X + columnIndex * (NODE_WIDTH + COLUMN_GAP);

    columns.push({
      directory,
      x,
      y: PADDING_Y,
      width: NODE_WIDTH,
    });

    sortedFiles.forEach((file, fileIndex) => {
      const node: ArchitectureGraphNodeLayout = {
        directory,
        file: file.file,
        height: NODE_HEIGHT,
        label: fileName(file.file),
        status: file.status,
        width: NODE_WIDTH,
        x,
        y: PADDING_Y + HEADER_HEIGHT + fileIndex * (NODE_HEIGHT + ROW_GAP),
      };

      nodes.push(node);
      nodesByFile.set(file.file, node);
    });
  });

  const columnCount = Math.max(directoryEntries.length, 1);
  const maxFiles = directoryEntries.reduce((max, [, files]) => Math.max(max, files.length), 0);
  const edges: ArchitectureGraphEdgeLayout[] = diff.edges.flatMap((edge) => {
    const fromNode = nodesByFile.get(edge.fromFile);
    const toNode = nodesByFile.get(edge.toFile);
    if (!fromNode || !toNode) {
      return [];
    }

    return [
      {
        d: edgePath(fromNode, toNode),
        fromFile: edge.fromFile,
        status: edge.status,
        toFile: edge.toFile,
      },
    ];
  });

  return {
    columns,
    edges,
    height:
      PADDING_Y * 2 +
      HEADER_HEIGHT +
      Math.max(maxFiles, 1) * NODE_HEIGHT +
      Math.max(maxFiles - 1, 0) * ROW_GAP,
    nodes,
    width: PADDING_X * 2 + columnCount * NODE_WIDTH + Math.max(columnCount - 1, 0) * COLUMN_GAP,
  };
}

function edgePath(
  fromNode: ArchitectureGraphNodeLayout,
  toNode: ArchitectureGraphNodeLayout,
): string {
  const startX = fromNode.x + fromNode.width;
  const startY = fromNode.y + fromNode.height / 2;
  const endX = toNode.x;
  const endY = toNode.y + toNode.height / 2;

  if (fromNode.x === toNode.x) {
    const curveX = startX + 28;
    return `M ${startX} ${startY} C ${curveX} ${startY}, ${curveX} ${endY}, ${endX + toNode.width} ${endY}`;
  }

  if (endX <= startX) {
    const curveX = Math.max(startX, endX) + 36;
    return `M ${startX} ${startY} C ${curveX} ${startY}, ${curveX} ${endY}, ${endX + toNode.width} ${endY}`;
  }

  const midX = (startX + endX) / 2;
  return `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;
}

function fileName(file: string): string {
  const segments = file.split("/");
  return segments[segments.length - 1] ?? file;
}

function fileDirectory(file: string): string {
  const separatorIndex = file.lastIndexOf("/");
  return separatorIndex === -1 ? "." : file.slice(0, separatorIndex);
}
