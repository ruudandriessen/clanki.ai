import { parseCliVersion } from "./parse-cli-version";
import { isCliNotInstalled, runCliCommand } from "./run-cli-command";

export type GhCliStatus =
  | { status: "not-setup" }
  | { status: "setup"; version: string }
  | { status: "setup-no-auth"; version: string };

export function getGhCliStatus(): GhCliStatus {
  const versionResult = runCliCommand("gh", ["--version"]);
  if (isCliNotInstalled(versionResult.error)) {
    return { status: "not-setup" };
  }

  if (versionResult.error) {
    return { status: "not-setup" };
  }

  const version = parseCliVersion(versionResult.stdout);
  if (!version) {
    return { status: "not-setup" };
  }

  const authResult = runCliCommand("gh", ["auth", "status"]);
  if (authResult.status === 0) {
    return { status: "setup", version };
  }

  return { status: "setup-no-auth", version };
}
