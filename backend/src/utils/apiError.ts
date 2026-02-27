import { Response } from "express";

export const apiError = (
  res: Response,
  status: number,
  error: string,
  code?: string,
  details?: unknown
) => {
  const payload: { error: string; code?: string; details?: unknown } = { error };

  if (code) {
    payload.code = code;
  }

  if (details !== undefined) {
    payload.details = details;
  }

  return res.status(status).json(payload);
};
