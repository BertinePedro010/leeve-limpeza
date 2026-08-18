import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { summary } from "../controllers/reportsController";

const router = Router();
router.use(requireAuth);
router.get("/summary", asyncHandler(summary));

export default router;