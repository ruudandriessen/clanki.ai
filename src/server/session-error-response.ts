const CONNECTION_SLOT_ERROR_CODE = "53300";
const CONNECTION_SLOT_ERROR_TEXT = "remaining connection slots are reserved";

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isValidHttpStatus(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value) && value >= 200 && value <= 599;
}

function getNestedStatus(error: unknown): number | null {
    if (!isRecord(error)) {
        return null;
    }

    const status = error.status;
    if (isValidHttpStatus(status)) {
        return status;
    }

    const statusCode = error.statusCode;
    if (isValidHttpStatus(statusCode)) {
        return statusCode;
    }

    return getNestedStatus(error.cause);
}

function hasConnectionSlotError(error: unknown): boolean {
    if (!isRecord(error)) {
        return false;
    }

    if (error.code === CONNECTION_SLOT_ERROR_CODE) {
        return true;
    }

    const message = error.message;
    if (typeof message === "string" && message.toLowerCase().includes(CONNECTION_SLOT_ERROR_TEXT)) {
        return true;
    }

    return hasConnectionSlotError(error.cause);
}

export function toSessionErrorResponse(error: unknown): Response {
    if (hasConnectionSlotError(error)) {
        return new Response("Authentication temporarily unavailable", { status: 503 });
    }

    const status = getNestedStatus(error);
    if (status === 401 || status === 403) {
        return new Response("Unauthorized", { status: 401 });
    }

    return new Response("Failed to get session", {
        status: status && status >= 500 ? status : 500,
    });
}
