import { ELECTRIC_PROTOCOL_QUERY_PARAMS } from "@electric-sql/client";
import { getEnv } from "../env";

interface ElectricOptions {
    table: string;
    where?: string;
    request: Request;
}

export const electricFn = async ({ request, table, where }: ElectricOptions) => {
    const env = getEnv();
    if (!env.ELECTRIC_SECRET || !env.ELECTRIC_SOURCE_ID) {
        throw new Error("Missing ELECTRIC_SECRET or ELECTRIC_SOURCE_ID");
    }
    const requestUrl = new URL(request.url);

    const targetUrl = new URL(`https://api.electric-sql.cloud/v1/shape`);
    requestUrl.searchParams.forEach((value, key) => {
        if (ELECTRIC_PROTOCOL_QUERY_PARAMS.includes(key)) {
            targetUrl.searchParams.set(key, value);
        }
    });

    targetUrl.searchParams.set("secret", env.ELECTRIC_SECRET);
    targetUrl.searchParams.set("source_id", env.ELECTRIC_SOURCE_ID);
    targetUrl.searchParams.set("table", table);

    if (where) {
        targetUrl.searchParams.set("where", where);
    }

    const response = await fetch(targetUrl);
    const headers = new Headers(response.headers);
    headers.delete(`content-encoding`);
    headers.delete(`content-length`);
    headers.set(`cache-control`, `no-store`);

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
};
