import { PgDialect } from "drizzle-orm/pg-core";

import type { SQL } from "drizzle-orm";

export const clauseToString = (clause?: SQL): string => {
    if (!clause) {
        throw new Error("No clause provided");
    }

    const pgDialect = new PgDialect();
    const { sql, params } = pgDialect.sqlToQuery(clause);

    // Use Drizzle's built-in parameter injection - replace PostgreSQL placeholders with actual values
    let finalSql = sql.replace(/\$(\d+)/g, (_, paramIndex) => {
        const param = params[Number(paramIndex) - 1];
        if (typeof param === "string") {
            return `'${param.replace(/'/g, "''")}'`;
        }
        return String(param);
    });

    // Remove table prefixes for Electric SQL compatibility (e.g., "chore"."family_id" -> "family_id")
    finalSql = finalSql.replace(/"[^"]+"\./g, "");

    // Remove outer parentheses if present
    finalSql = finalSql.replace(/^\((.*)\)$/, "$1");

    return finalSql;
};
