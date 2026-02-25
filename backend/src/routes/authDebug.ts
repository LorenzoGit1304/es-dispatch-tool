import { NextFunction, Request, Response, Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";

const router = Router();

const attachDebugAuth = (req: Request, _res: Response, next: NextFunction) => {
  if (process.env.AUTH_DEBUG_BYPASS !== "true") {
    return next();
  }

  const debugClerkId = req.header("x-debug-clerk-id");
  if (debugClerkId) {
    (req as any).auth = {
      ...(req as any).auth,
      userId: debugClerkId,
    };
  }

  next();
};

// Real Clerk path: requires a valid Clerk token.
router.get("/me", requireAuth, (req, res) => {
  const auth = (req as any).auth;
  res.json({
    userId: auth?.userId ?? null,
    sessionId: auth?.sessionId ?? null,
    orgId: auth?.orgId ?? null,
  });
});

// Local testing path: allows 401/403/200 role checks without frontend tokens.
router.get(
  "/simulate/role/admin",
  attachDebugAuth,
  requireRole("ADMIN"),
  (_req, res) => {
    res.json({ ok: true, role: "ADMIN" });
  }
);

export default router;
