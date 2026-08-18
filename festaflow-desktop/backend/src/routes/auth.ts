import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler";
import { validate } from "../middleware/validate";
import { login, recoverPassword } from "../controllers/authController";

const router = Router();

router.post("/login", validate(z.object({ email: z.string().email(), password: z.string().min(6) })), asyncHandler(login));
router.post("/recover", validate(z.object({ email: z.string().email() })), asyncHandler(recoverPassword));

export default router;
