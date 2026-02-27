import { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { apiError } from "../utils/apiError";

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  // getAuth es la forma segura y oficial de recuperar la sesión
  const { userId } = getAuth(req);

  // Si no hay userId, la sesión no existe o expiró
  if (!userId) {
    return apiError(res, 401, "Unauthorized", "UNAUTHORIZED");
  }

  // Si llegamos aquí, el usuario está autenticado
  next();
};
