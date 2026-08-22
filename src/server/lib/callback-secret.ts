import fs from "node:fs";
import path from "node:path";
import { getDataDirectory } from "../db/data-directory";

function getCallbackSecretPath(): string {
  return path.join(getDataDirectory(), "callback-secret");
}

export function getTaskRunnerCallbackSecret(): string {
  const fromEnv = process.env.TASK_RUNNER_CALLBACK_SECRET?.trim();
  if (fromEnv && fromEnv.length > 0) {
    return fromEnv;
  }

  const secretPath = getCallbackSecretPath();
  if (fs.existsSync(secretPath)) {
    const existing = fs.readFileSync(secretPath, "utf8").trim();
    if (existing.length > 0) {
      return existing;
    }
  }

  const generated =
    crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
  fs.writeFileSync(secretPath, generated, { encoding: "utf8", mode: 0o600 });
  return generated;
}
