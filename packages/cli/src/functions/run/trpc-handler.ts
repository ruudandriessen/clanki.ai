import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { formatRuntimeErrorForLog } from "../ui-runtime";
import type { ClankiUiRuntime } from "../ui-runtime";
import { runAppRouter } from "./endpoints/_app";
import { createRunTrpcContext } from "./trpc";

const TRPC_ENDPOINT = "/trpc";

export async function handleTrpcRequest(
  runtime: ClankiUiRuntime,
  request: Request,
): Promise<Response | null> {
  const url = new URL(request.url);

  if (url.pathname !== TRPC_ENDPOINT && !url.pathname.startsWith(`${TRPC_ENDPOINT}/`)) {
    return null;
  }

  return fetchRequestHandler({
    endpoint: TRPC_ENDPOINT,
    req: request,
    router: runAppRouter,
    createContext: () => createRunTrpcContext(runtime),
    onError: ({ error, path }) => {
      const procedurePath = path ?? "<unknown>";
      const errorDetails =
        error.cause !== undefined
          ? formatRuntimeErrorForLog(error.cause)
          : (error.stack ?? error.message);

      process.stderr.write(
        `tRPC request failed for ${procedurePath}: ${error.message}\n${errorDetails}\n`,
      );
    },
  });
}

export function isTrpcPath(pathname: string): boolean {
  return pathname === TRPC_ENDPOINT || pathname.startsWith(`${TRPC_ENDPOINT}/`);
}
