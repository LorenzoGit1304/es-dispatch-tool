import { NextFunction, Request, Response } from "express";
import { ZodError, ZodTypeAny } from "zod";
import { apiError } from "../utils/apiError";

type ValidateTarget = "body" | "params" | "query";

const mapZodIssuesToFieldErrors = (error: ZodError): Record<string, string[]> => {
  const fieldErrors: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const path = issue.path.length > 0 ? issue.path.join(".") : "_root";
    if (!fieldErrors[path]) {
      fieldErrors[path] = [];
    }
    fieldErrors[path].push(issue.message);
  }

  return fieldErrors;
};

export const validate = (schema: ZodTypeAny, target: ValidateTarget = "body") => {
  return (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req[target]);

    if (!parsed.success) {
      return apiError(
        res,
        400,
        "Validation failed",
        "VALIDATION_FAILED",
        { fieldErrors: mapZodIssuesToFieldErrors(parsed.error) }
      );
    }

    (req as Request)[target] = parsed.data;
    return next();
  };
};
