import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

const schema = z.object({
  nome: z.string().min(2),
  cargo: z.string().min(2),
  telefone: z.string().optional().nullable(),
  valorDiaria: z.coerce.number().nonnegative(),
  tipoPagamento: z.string().default("diaria"),
  observacoes: z.string().optional().nullable(),
});

router.get("/", async (_req, res) => {
  const employees = await prisma.employee.findMany({ orderBy: { nome: "asc" } });
  res.json(employees);
});

router.post("/", async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Funcionario invalido." });
  const employee = await prisma.employee.create({ data: parsed.data });
  res.status(201).json(employee);
});

router.put("/:id", async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Funcionario invalido." });
  const employee = await prisma.employee.update({ where: { id: req.params.id }, data: parsed.data });
  res.json(employee);
});

router.delete("/:id", async (req, res) => {
  await prisma.employee.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;