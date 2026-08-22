import type { ArchitectureDiff } from "@clanki/protocol";
import {
  architectureStatusLabel,
  architectureStatusToneClass,
} from "@/lib/architecture-diff-status";
import { cn } from "@/lib/utils";

interface ArchitectureDiffChangeListProps {
  diff: ArchitectureDiff;
}

export function ArchitectureDiffChangeList({ diff }: ArchitectureDiffChangeListProps) {
  const files = diff.files.filter((file) => file.status !== "unchanged");
  const edges = diff.edges.filter((edge) => edge.status !== "unchanged");

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h3 className="text-xs font-bold tracking-[0.04em] text-muted-foreground uppercase">
          Files
        </h3>
        <ul className="divide-y divide-border/50">
          {files.map((file) => (
            <li
              key={file.file}
              className="flex items-baseline justify-between gap-3 py-1.5 text-sm"
            >
              <span className="min-w-0 truncate font-mono text-xs">{file.file}</span>
              <span className={cn("shrink-0 text-xs", architectureStatusToneClass(file.status))}>
                {architectureStatusLabel(file.status)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-bold tracking-[0.04em] text-muted-foreground uppercase">
          Imports
        </h3>
        {edges.length === 0 ? (
          <p className="text-xs text-muted-foreground">No import edges changed.</p>
        ) : (
          <ul className="divide-y divide-border/50">
            {edges.map((edge) => (
              <li
                key={`${edge.status}:${edge.fromFile}->${edge.toFile}`}
                className="flex items-baseline justify-between gap-3 py-1.5 text-sm"
              >
                <span className="min-w-0 truncate font-mono text-xs">
                  {edge.fromFile} → {edge.toFile}
                </span>
                <span className={cn("shrink-0 text-xs", architectureStatusToneClass(edge.status))}>
                  {architectureStatusLabel(edge.status)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
