import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../prisma";
import { signToken } from "../utils/jwt";

export async function login(req: Request, res: Response) {
  const { email, password } = req.body as { email: string; password: string };
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ message: "Usuario ou senha invalidos." });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ message: "Usuario ou senha invalidos." });

  const token = signToken({ id: user.id, role: user.role });
  return res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
}

export async function recoverPassword(req: Request, res: Response) {
  const { email } = req.body as { email: string };
  return res.json({ message: `Se ${email} existir, as instrucoes serao enviadas.` });
}
