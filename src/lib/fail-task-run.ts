export async function failTaskRun(args: {
    backendBaseUrl: string;
    callbackToken: string;
    errorMessage: string;
    executionId: string;
}): Promise<void> {
    const response = await fetch(
        `${args.backendBaseUrl}/api/internal/task-runs/${args.executionId}/fail`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${args.callbackToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                error: args.errorMessage,
            }),
        },
    );

    if (!response.ok) {
        throw new Error("Failed to report task-run failure");
    }
}
