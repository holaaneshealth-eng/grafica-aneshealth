import { Router } from "express";
import { auditRepo } from "../repo";
import { authGuard, requireAdmin } from "../middleware";

export const auditRouter = Router();

auditRouter.use(authGuard, requireAdmin);

auditRouter.get("/", async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "200"), 10) || 200, 1000);
  res.json({ entries: await auditRepo.recent(limit) });
});
