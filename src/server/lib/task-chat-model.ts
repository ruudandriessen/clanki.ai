import { DEFAULT_OPENCODE_MODEL, DEFAULT_OPENCODE_PROVIDER } from "./opencode";

export function readTaskChatModel(forwardedProps: Record<string, unknown>): {
  model: string;
  provider: string;
} {
  const provider =
    typeof forwardedProps.provider === "string" && forwardedProps.provider.trim().length > 0
      ? forwardedProps.provider.trim()
      : DEFAULT_OPENCODE_PROVIDER;
  const model =
    typeof forwardedProps.model === "string" && forwardedProps.model.trim().length > 0
      ? forwardedProps.model.trim()
      : DEFAULT_OPENCODE_MODEL;

  return { model, provider };
}
