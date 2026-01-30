import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";

export interface GroupNodeData {
  label: string;
  fileCount: number;
  color: string;
  description: string;
  [key: string]: unknown;
}

export function GroupNode({ data }: NodeProps) {
  const { label, fileCount, color, description } =
    data as unknown as GroupNodeData;

  return (
    <div
      className="bg-card rounded-lg px-5 py-4 min-w-[160px] max-w-[200px] border-2 cursor-pointer transition-shadow hover:shadow-xl"
      style={{ borderColor: color }}
    >
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <div className="font-semibold text-sm text-card-foreground">{label}</div>
      <div className="text-xs text-muted-foreground mt-1">{description}</div>
      <div
        className="text-xs font-medium mt-2 px-2 py-0.5 rounded-full inline-block"
        style={{ backgroundColor: color + "20", color }}
      >
        {fileCount} {fileCount === 1 ? "file" : "files"}
      </div>
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
    </div>
  );
}
