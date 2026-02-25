import { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  // getAuth es la forma segura y oficial de recuperar la sesión
  const { userId } = getAuth(req);

  // Si no hay userId, la sesión no existe o expiró
  if (!userId) {
    // Es importante el return para que el código no intente seguir ejecutándose
    return res.status(401).json({ 
      error: "Unauthorized", 
      message: "No se encontró una sesión activa." 
    });
  }

  // Si llegamos aquí, el usuario está autenticado
  next();
};