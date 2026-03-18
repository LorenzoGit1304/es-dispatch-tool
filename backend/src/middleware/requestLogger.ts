import { NextFunction, Request, Response } from "express";

const getClientIp = (req: Request): string => {
  const forwardedFor = req.headers["x-forwarded-for"];

  if (typeof forwardedFor === "string" && forwardedFor.length > 0) {
    return forwardedFor.split(",")[0]?.trim() ?? "unknown";
  }

  if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
    return forwardedFor[0] ?? "unknown";
  }

  return req.ip || "unknown";
};

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const startedAt = Date.now();

  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    const requestId = res.locals.requestId ?? "unknown";
    const ip = getClientIp(req);
    const clerkId = (req as any).auth?.userId ?? "anonymous";

    console.log(
      `[${requestId}] ${req.method} ${req.originalUrl} -> ${res.statusCode} ${durationMs}ms ip=${ip} user=${clerkId}`
    );
  });

  next();
};
