import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../prisma";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Dados invalidos." });

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user) return res.status(401).json({ message: "Usuario ou senha invalidos." });

  const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!valid) return res.status(401).json({ message: "Usuario ou senha invalidos." });

  const token = jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET || "dev-secret",
    { expiresIn: "8h" }
  );

  return res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

router.post("/recover", async (req, res) => {
  const email = String(req.body?.email || "");
  return res.json({ message: `Se ${email} existir, um link de recuperacao sera enviado.` });
});

export default router;