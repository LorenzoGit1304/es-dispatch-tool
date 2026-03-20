import { PoolClient } from "pg";

export type DispatchLanguage = "English" | "Spanish" | "Both";
export type DispatchStatus = "AVAILABLE" | "BUSY";

export const findAssignableEs = async (
  client: PoolClient,
  language: DispatchLanguage,
  status: DispatchStatus,
  excludedEsId?: number
) => {
  const params: Array<string | number> = [language, status];
  let exclusionClause = "";

  if (excludedEsId !== undefined) {
    params.push(excludedEsId);
    exclusionClause = `AND id != $${params.length}`;
  }

  const result = await client.query(
    `SELECT *
     FROM users
     WHERE role = 'ES'
       AND language = $1
       AND status = $2
       ${exclusionClause}
     ORDER BY last_assigned_at ASC NULLS FIRST
     LIMIT 1`,
    params
  );

  return result.rows[0] ?? null;
};
