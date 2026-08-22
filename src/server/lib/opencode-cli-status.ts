import type { OpencodeCliStatus } from "@/shared/cli-status";
import { parseCliVersion } from "./parse-cli-version";
import { isCliNotInstalled, runCliCommand } from "./run-cli-command";

export function getOpencodeCliStatus(): OpencodeCliStatus {
  const versionResult = runCliCommand("opencode", ["--version"]);
  if (isCliNotInstalled(versionResult.error)) {
    return { status: "not-setup" };
  }

  if (versionResult.error || versionResult.status !== 0) {
    return { status: "not-setup" };
  }

  const version = parseCliVersion(versionResult.stdout);
  if (!version) {
    return { status: "not-setup" };
  }

  return { status: "setup", version };
}
