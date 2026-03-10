import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type AppDb = PostgresJsDatabase<typeof schema>;

type DbEnv = {
    DATABASE_URL?: string;
};

type DbClientCacheEntry = {
    url: string;
    db: AppDb;
};

type GlobalWithDbCache = typeof globalThis & {
    __clankiDbClientCache?: DbClientCacheEntry;
};

const globalWithDbCache = globalThis as GlobalWithDbCache;

function createDb(url: string): AppDb {
    const sql = postgres(url, {
        fetch_types: false,
        prepare: false,
        // Keep per-runtime connection usage predictable in serverless deployments.
        max: 1,
        idle_timeout: 20,
        connect_timeout: 10,
    });

    return drizzle({ client: sql, schema });
}

export function getDb(env: DbEnv): AppDb {
    const url = env.DATABASE_URL;
    if (!url) {
        throw new Error("Database connection string is missing");
    }

    const cached = globalWithDbCache.__clankiDbClientCache;
    if (cached && cached.url === url) {
        return cached.db;
    }

    const db = createDb(url);
    globalWithDbCache.__clankiDbClientCache = { url, db };
    return db;
}
