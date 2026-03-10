import type {
  CreateAssistantSessionRequest,
  CreateAssistantSessionResponse,
  DeleteWorkspaceRequest,
  DeleteWorkspaceResponse,
  EnsureAssistantSessionRequest,
  EnsureAssistantSessionResponse,
  GetAssistantSessionDiffRequest,
  GetAssistantSessionDiffResponse,
  ListAssistantSessionsRequest,
  ListAssistantSessionsResponse,
  ListOpencodeModelsRequest,
  ListOpencodeModelsResponse,
  LocalRunnerHealthResponse,
  LocalRunnerInfoResponse,
  PromptAssistantSessionRequest,
  PromptAssistantSessionResponse,
} from "./local-runner-protocol";

export function createLocalRunnerClient(baseUrl: string) {
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;

  return {
    async createAssistantSession(
      body: CreateAssistantSessionRequest,
    ): Promise<CreateAssistantSessionResponse> {
      return await postJson(`${normalizedBaseUrl}/assistant/session/create`, body);
    },
    async deleteWorkspace(body: DeleteWorkspaceRequest): Promise<DeleteWorkspaceResponse> {
      return await postJson(`${normalizedBaseUrl}/workspace/delete`, body);
    },
    async ensureAssistantSession(
      body: EnsureAssistantSessionRequest,
    ): Promise<EnsureAssistantSessionResponse> {
      return await postJson(`${normalizedBaseUrl}/assistant/session/ensure`, body);
    },
    async getAssistantSessionDiff(
      params: GetAssistantSessionDiffRequest,
    ): Promise<GetAssistantSessionDiffResponse> {
      const searchParams = new URLSearchParams({
        directory: params.directory,
        sessionId: params.sessionId,
      });

      if (params.messageId) {
        searchParams.set("messageId", params.messageId);
      }

      return await getJson(
        `${normalizedBaseUrl}/assistant/session/diff?${searchParams.toString()}`,
      );
    },
    async health(): Promise<LocalRunnerHealthResponse> {
      return await getJson(`${normalizedBaseUrl}/health`);
    },
    async info(): Promise<LocalRunnerInfoResponse> {
      return await getJson(`${normalizedBaseUrl}/runner/info`);
    },
    async listAssistantSessions(
      params: ListAssistantSessionsRequest,
    ): Promise<ListAssistantSessionsResponse> {
      return await getJson(
        `${normalizedBaseUrl}/assistant/sessions?${new URLSearchParams({
          directory: params.directory,
        }).toString()}`,
      );
    },
    async listOpencodeModels(
      params: ListOpencodeModelsRequest,
    ): Promise<ListOpencodeModelsResponse> {
      return await getJson(
        `${normalizedBaseUrl}/opencode/models?${new URLSearchParams({
          directory: params.directory,
        }).toString()}`,
      );
    },
    async promptAssistantSession(
      body: PromptAssistantSessionRequest,
    ): Promise<PromptAssistantSessionResponse> {
      return await postJson(`${normalizedBaseUrl}/assistant/session/prompt`, body);
    },
  };
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  return await parseJsonResponse<T>(response);
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return await parseJsonResponse<T>(response);
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const body = text.trim().length > 0 ? (JSON.parse(text) as T | { error: string }) : null;

  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : `${response.status} ${response.statusText}`.trim();
    throw new Error(message);
  }

  return body as T;
}
