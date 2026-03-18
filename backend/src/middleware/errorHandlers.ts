import { NextFunction, Request, Response } from "express";
import { apiError } from "../utils/apiError";

export const notFoundHandler = (req: Request, res: Response) => {
  return apiError(
    res,
    404,
    `Route not found: ${req.method} ${req.originalUrl}`,
    "ROUTE_NOT_FOUND"
  );
};

export const globalErrorHandler = (
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  const requestId = res.locals.requestId ?? "unknown";

  console.error(`[${requestId}] unhandled error:`, error);

  if (res.headersSent) {
    return;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    error.type === "entity.too.large"
  ) {
    return apiError(res, 413, "Request body too large", "PAYLOAD_TOO_LARGE");
  }

  if (error instanceof SyntaxError && "body" in error) {
    return apiError(res, 400, "Invalid JSON payload", "INVALID_JSON");
  }

  return apiError(res, 500, "Internal server error", "INTERNAL_SERVER_ERROR");
};
