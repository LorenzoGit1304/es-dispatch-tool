import { PoolClient } from "pg";

export type DispatchLanguage = "English" | "Spanish" | "Both";
export type DispatchStatus = "AVAILABLE" | "BUSY";

export const isEsLanguageCompatible = (
  enrollmentLanguage: DispatchLanguage,
  esLanguage: string | null
) => {
  if (!esLanguage) {
    return false;
  }

  if (enrollmentLanguage === "Both") {
    return ["English", "Spanish", "Both"].includes(esLanguage);
  }

  return esLanguage === enrollmentLanguage || esLanguage === "Both";
};

export const findAssignableEs = async (
  client: PoolClient,
  language: DispatchLanguage,
  status: DispatchStatus,
  excludedEsId?: number
) => {
  const params: Array<string | number> = [status];
  let languageClause = "";
  let statusParamIndex = 1;
  let exclusionClause = "";

  if (language === "Both") {
    languageClause = `AND language IN ('English', 'Spanish', 'Both')`;
  } else {
    params.unshift(language);
    languageClause = `AND language IN ($1, 'Both')`;
    statusParamIndex = 2;
  }

  if (excludedEsId !== undefined) {
    params.push(excludedEsId);
    exclusionClause = `AND id != $${params.length}`;
  }

  const result = await client.query(
    `SELECT *
     FROM users
     WHERE role = 'ES'
       ${languageClause}
       AND status = $${statusParamIndex}
       ${exclusionClause}
     ORDER BY last_assigned_at ASC NULLS FIRST
     LIMIT 1`,
    params
  );

  return result.rows[0] ?? null;
};
