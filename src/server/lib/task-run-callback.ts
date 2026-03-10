import { getEnv } from "@/server/env";
import {
    type TaskRunCallbackClaims,
    verifyTaskRunCallbackToken,
} from "@/server/lib/task-run-callback-token";

function getCallbackToken(request: Request): string | null {
    const header = request.headers.get("authorization");
    if (!header) {
        return null;
    }

    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer") {
        return null;
    }

    const normalized = token?.trim();
    return normalized && normalized.length > 0 ? normalized : null;
}

export function verifyTaskRunCallback(
    request: Request,
    executionId: string,
): TaskRunCallbackClaims | null {
    const token = getCallbackToken(request);
    if (!token) {
        return null;
    }

    const env = getEnv();
    const claims = verifyTaskRunCallbackToken(token, env);
    if (!claims || claims.executionId !== executionId) {
        return null;
    }

    return claims;
}
