export function NeoLoader({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const s = size === "sm" ? 20 : size === "md" ? 28 : 40;

  return <div className="neo-loader-block" style={{ width: s, height: s }} aria-label="Loading" />;
}

export function NeoLoaderInline({ className }: { className?: string }) {
  return (
    <div
      className={`neo-loader-block ${className ?? ""}`}
      style={{ width: 14, height: 14 }}
      aria-hidden="true"
    />
  );
}
