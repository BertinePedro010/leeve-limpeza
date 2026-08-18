import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

const schema = z.object({
  nome: z.string().min(2),
  descricao: z.string().optional().nullable(),
  valor: z.coerce.number().nonnegative(),
  duracaoHoras: z.coerce.number().nonnegative(),
  categoria: z.string().min(2),
  status: z.string().default("ativo"),
});

router.get("/", async (_req, res) => {
  const services = await prisma.service.findMany({ orderBy: { nome: "asc" } });
  res.json(services);
});

router.post("/", async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Servico invalido." });
  const service = await prisma.service.create({ data: parsed.data });
  res.status(201).json(service);
});

router.put("/:id", async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Servico invalido." });
  const service = await prisma.service.update({ where: { id: req.params.id }, data: parsed.data });
  res.json(service);
});

router.delete("/:id", async (req, res) => {
  await prisma.service.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;