export function parseCliVersion(output: string): string | null {
  const firstLine = output.trim().split("\n")[0]?.trim() ?? "";
  if (firstLine.length === 0) {
    return null;
  }

  const versionMatch = firstLine.match(/\b(\d+\.\d+\.\d+(?:[-+.\w]*)?)\b/);
  return versionMatch?.[1] ?? null;
}
