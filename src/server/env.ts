export type AppEnv = {
    ENVIRONMENT?: string;
    DATABASE_URL?: string;

    BETTER_AUTH_SECRET: string;
    CREDENTIALS_ENCRYPTION_KEY: string;

    GITHUB_CLIENT_ID: string;
    GITHUB_CLIENT_SECRET: string;
    GITHUB_WEBHOOK_SECRET: string;
    GITHUB_APP_ID?: string;
    GITHUB_APP_PRIVATE_KEY?: string;

    ELECTRIC_SOURCE_ID: string;
    ELECTRIC_SECRET: string;

    DURABLE_STREAMS_SERVICE_ID?: string;
    DURABLE_STREAMS_SECRET?: string;

    TASK_RUNNER_CALLBACK_SECRET?: string;
};

function requireEnv(name: keyof AppEnv): string {
    const value = process.env[name];
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error(`Missing required env var: ${name}`);
    }

    return value;
}

export function getEnv(): AppEnv {
    return {
        ENVIRONMENT: process.env.ENVIRONMENT,
        DATABASE_URL: process.env.DATABASE_URL,

        BETTER_AUTH_SECRET: requireEnv("BETTER_AUTH_SECRET"),
        CREDENTIALS_ENCRYPTION_KEY: requireEnv("CREDENTIALS_ENCRYPTION_KEY"),

        GITHUB_CLIENT_ID: requireEnv("GITHUB_CLIENT_ID"),
        GITHUB_CLIENT_SECRET: requireEnv("GITHUB_CLIENT_SECRET"),
        GITHUB_WEBHOOK_SECRET: requireEnv("GITHUB_WEBHOOK_SECRET"),
        GITHUB_APP_ID: process.env.GITHUB_APP_ID,
        GITHUB_APP_PRIVATE_KEY: process.env.GITHUB_APP_PRIVATE_KEY,

        ELECTRIC_SOURCE_ID: requireEnv("ELECTRIC_SOURCE_ID"),
        ELECTRIC_SECRET: requireEnv("ELECTRIC_SECRET"),

        DURABLE_STREAMS_SERVICE_ID: process.env.DURABLE_STREAMS_SERVICE_ID,
        DURABLE_STREAMS_SECRET: process.env.DURABLE_STREAMS_SECRET,

        TASK_RUNNER_CALLBACK_SECRET: process.env.TASK_RUNNER_CALLBACK_SECRET,
    };
}

export function getTaskRunnerCallbackSecret(env: AppEnv): string {
    const explicitSecret = env.TASK_RUNNER_CALLBACK_SECRET?.trim();
    if (explicitSecret && explicitSecret.length > 0) {
        return explicitSecret;
    }

    const fallbackSecret = env.BETTER_AUTH_SECRET?.trim();
    if (fallbackSecret && fallbackSecret.length > 0) {
        return fallbackSecret;
    }

    throw new Error("Missing TASK_RUNNER_CALLBACK_SECRET or BETTER_AUTH_SECRET");
}
