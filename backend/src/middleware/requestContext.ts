import { NextFunction, Request, Response } from "express";
import { randomUUID } from "crypto";

export const requestContext = (_req: Request, res: Response, next: NextFunction) => {
  const requestId = randomUUID();

  res.locals.requestId = requestId;
  res.setHeader("x-request-id", requestId);

  next();
};
