import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

export const clauseToString = (clause?: SQL): string => {
  if (!clause) {
    throw new Error("No clause provided");
  }

  const pgDialect = new PgDialect();
  const { sql, params } = pgDialect.sqlToQuery(clause);

  let finalSql = sql.replace(/\$(\d+)/g, (_, paramIndex) => {
    const param = params[Number(paramIndex) - 1];
    if (typeof param === "string") {
      return `'${param.replace(/'/g, "''")}'`;
    }
    return String(param);
  });

  finalSql = finalSql.replace(/"[^"]+"\./g, "");
  finalSql = finalSql.replace(/^\((.*)\)$/, "$1");

  return finalSql;
};
