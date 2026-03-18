import { NextFunction, Request, Response } from "express";
import { apiError } from "../utils/apiError";

type RateLimitOptions = {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
  methods?: string[];
};

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

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

export const createRateLimit = ({ windowMs, maxRequests, keyPrefix, methods }: RateLimitOptions) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (methods && !methods.includes(req.method.toUpperCase())) {
      return next();
    }

    const now = Date.now();
    const key = `${keyPrefix}:${getClientIp(req)}`;
    const existing = buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      buckets.set(key, {
        count: 1,
        resetAt: now + windowMs,
      });
      return next();
    }

    if (existing.count >= maxRequests) {
      res.setHeader("retry-after", Math.ceil((existing.resetAt - now) / 1000));
      return apiError(
        res,
        429,
        "Too many requests. Please try again shortly.",
        "RATE_LIMITED"
      );
    }

    existing.count += 1;
    buckets.set(key, existing);

    return next();
  };
};
