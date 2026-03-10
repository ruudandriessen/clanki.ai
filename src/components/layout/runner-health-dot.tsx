import { useRunnerHealth } from "@/lib/runner-health";

export function RunnerHealthDot() {
  const { data, isPending } = useRunnerHealth();
  const isHealthy = data?.ok ?? false;
  const label = isPending ? "Checking runner" : `Runner ${isHealthy ? "up" : "down"}`;
  const toneClasses = isPending
    ? "bg-muted-foreground/45 animate-pulse"
    : isHealthy
      ? "bg-emerald-500"
      : "bg-rose-500";

  return (
    <span
      className={`inline-block h-1.5 w-1.5 rounded-full ${toneClasses}`}
      aria-label={label}
      role="status"
      title={label}
    />
  );
}
