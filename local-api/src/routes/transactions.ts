import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

const schema = z.object({
  tipo: z.enum(["receita", "despesa"]),
  categoria: z.string().min(2),
  descricao: z.string().min(2),
  valor: z.coerce.number().nonnegative(),
  data: z.coerce.date(),
  status: z.enum(["pago", "pendente"]),
  osId: z.string().uuid().optional().nullable(),
});

router.get("/", async (_req, res) => {
  const transactions = await prisma.transaction.findMany({ orderBy: { data: "desc" } });
  res.json(transactions);
});

router.post("/", async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Lancamento invalido." });
  const transaction = await prisma.transaction.create({ data: parsed.data });
  res.status(201).json(transaction);
});

router.put("/:id", async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Lancamento invalido." });
  const transaction = await prisma.transaction.update({ where: { id: req.params.id }, data: parsed.data });
  res.json(transaction);
});

router.delete("/:id", async (req, res) => {
  await prisma.transaction.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;