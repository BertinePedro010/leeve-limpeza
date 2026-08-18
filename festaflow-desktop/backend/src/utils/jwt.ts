import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";

export function signToken(payload: { id: string; role: Role }) {
  return jwt.sign(payload, process.env.JWT_SECRET || "festaflow-dev-secret", { expiresIn: "12h" });
}

export function verifyToken(token: string) {
  return jwt.verify(token, process.env.JWT_SECRET || "festaflow-dev-secret") as { id: string; role: Role };
}
