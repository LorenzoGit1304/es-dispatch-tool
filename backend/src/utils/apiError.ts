import { Response } from "express";

export const apiError = (
  res: Response,
  status: number,
  error: string,
  code?: string,
  details?: unknown
) => {
  const payload: { error: string; code?: string; details?: unknown; requestId?: string } = { error };

  if (code) {
    payload.code = code;
  }

  if (details !== undefined) {
    payload.details = details;
  }

  if (typeof res.locals?.requestId === "string") {
    payload.requestId = res.locals.requestId;
  }

  return res.status(status).json(payload);
};
