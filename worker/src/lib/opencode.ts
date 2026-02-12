export type OpenCodeEnv = {
  OPENCODE_BASE_URL?: string;
  OPENCODE_SERVER_PASSWORD?: string;
  OPENCODE_SERVER_USERNAME?: string;
  OPENCODE_MODEL?: string;
};

export type OpenCodeMessageResult = {
  assistantMessageId: string | null;
  output: string;
};

export async function createOpenCodeSession(env: OpenCodeEnv, title: string): Promise<string> {
  const response = await requestOpenCode(env, "/session", {
    method: "POST",
    body: JSON.stringify({ title }),
  });

  const payload = (await response.json()) as { id?: unknown };
  if (typeof payload.id !== "string" || payload.id.length === 0) {
    throw new Error("OpenCode returned an invalid session id");
  }

  return payload.id;
}

export async function sendOpenCodeMessage(
  env: OpenCodeEnv,
  sessionId: string,
  prompt: string,
): Promise<OpenCodeMessageResult> {
  const requestBody: Record<string, unknown> = {
    parts: [{ type: "text", text: prompt }],
  };

  if (env.OPENCODE_MODEL) {
    requestBody.model = env.OPENCODE_MODEL;
  }

  const response = await requestOpenCode(env, `/session/${encodeURIComponent(sessionId)}/message`, {
    method: "POST",
    body: JSON.stringify(requestBody),
  });

  const payload = (await response.json()) as Record<string, unknown>;
  const assistantMessageId = parseAssistantMessageId(payload);
  const output = collectText(payload).trim();

  return {
    assistantMessageId,
    output: output.length > 0 ? output : "OpenCode completed without text output.",
  };
}

async function requestOpenCode(
  env: OpenCodeEnv,
  path: string,
  init: RequestInit,
): Promise<Response> {
  const baseUrl = env.OPENCODE_BASE_URL;
  if (!baseUrl) {
    throw new Error("OPENCODE_BASE_URL is not configured");
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...getOpenCodeAuthHeader(env),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    const text = body.trim();
    const suffix = text.length > 0 ? `: ${text}` : "";
    throw new Error(`OpenCode request failed (${response.status})${suffix}`);
  }

  return response;
}

function getOpenCodeAuthHeader(env: OpenCodeEnv): Record<string, string> {
  const password = env.OPENCODE_SERVER_PASSWORD;
  if (!password) {
    return {};
  }

  const username = env.OPENCODE_SERVER_USERNAME ?? "opencode";
  return {
    Authorization: `Basic ${btoa(`${username}:${password}`)}`,
  };
}

function parseAssistantMessageId(payload: Record<string, unknown>): string | null {
  const info = payload.info;
  if (!info || typeof info !== "object") {
    return null;
  }

  const id = (info as Record<string, unknown>).id;
  if (typeof id !== "string" || id.length === 0) {
    return null;
  }

  return id;
}

function collectText(payload: Record<string, unknown>): string {
  const chunks: string[] = [];
  collectTextRecursive(payload.parts, chunks);
  return chunks.join("\n\n");
}

function collectTextRecursive(value: unknown, chunks: string[]): void {
  if (!value) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectTextRecursive(item, chunks);
    }
    return;
  }

  if (typeof value !== "object") {
    return;
  }

  const record = value as Record<string, unknown>;
  const text = record.text;
  if (typeof text === "string" && text.trim().length > 0) {
    chunks.push(text.trim());
  }

  if ("parts" in record) {
    collectTextRecursive(record.parts, chunks);
  }
}
