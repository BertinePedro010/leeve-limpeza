import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

const schema = z.object({
  nome: z.string().min(2),
  email: z.string().email().optional().nullable(),
  telefone: z.string().optional().nullable(),
  documento: z.string().optional().nullable(),
  endereco: z.string().optional().nullable(),
  observacoes: z.string().optional().nullable(),
});

router.get("/", async (_req, res) => {
  const clients = await prisma.client.findMany({ orderBy: { nome: "asc" }, include: { orders: true } });
  res.json(clients);
});

router.post("/", async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Cliente invalido." });
  const client = await prisma.client.create({ data: parsed.data });
  res.status(201).json(client);
});

router.put("/:id", async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Cliente invalido." });
  const client = await prisma.client.update({ where: { id: req.params.id }, data: parsed.data });
  res.json(client);
});

router.delete("/:id", async (req, res) => {
  await prisma.client.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;