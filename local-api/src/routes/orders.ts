import { Router } from "express";
import { z } from "zod";
import { OSStatus } from "@prisma/client";
import { prisma } from "../prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

const itemSchema = z.object({
  serviceId: z.string().uuid(),
  quantidade: z.coerce.number().int().positive(),
  valorUnitario: z.coerce.number().nonnegative(),
});

const orderSchema = z.object({
  clienteId: z.string().uuid(),
  dataEvento: z.coerce.date(),
  horarioInicio: z.string().min(1),
  horarioFim: z.string().min(1),
  local: z.string().min(2),
  status: z.nativeEnum(OSStatus).default(OSStatus.PENDENTE),
  formaPagamento: z.string().optional().nullable(),
  observacoes: z.string().optional().nullable(),
  assinaturaNome: z.string().optional().nullable(),
  assinaturaData: z.coerce.date().optional().nullable(),
  anexos: z.array(z.string()).default([]),
  funcionariosIds: z.array(z.string().uuid()).default([]),
  itens: z.array(itemSchema).min(1),
});

async function generateOrderCode() {
  const year = new Date().getFullYear();
  const count = await prisma.serviceOrder.count();
  return `OS-${year}-${String(count + 1).padStart(4, "0")}`;
}

router.get("/", async (_req, res) => {
  const orders = await prisma.serviceOrder.findMany({
    orderBy: { dataEvento: "asc" },
    include: { cliente: true, itens: { include: { service: true } }, funcionarios: true },
  });
  res.json(orders);
});

router.post("/", async (req, res) => {
  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "OS invalida." });

  const valorTotal = parsed.data.itens.reduce(
    (sum, item) => sum + Number(item.valorUnitario) * item.quantidade,
    0
  );

  const order = await prisma.serviceOrder.create({
    data: {
      codigo: await generateOrderCode(),
      clienteId: parsed.data.clienteId,
      dataEvento: parsed.data.dataEvento,
      horarioInicio: parsed.data.horarioInicio,
      horarioFim: parsed.data.horarioFim,
      local: parsed.data.local,
      status: parsed.data.status,
      formaPagamento: parsed.data.formaPagamento,
      observacoes: parsed.data.observacoes,
      assinaturaNome: parsed.data.assinaturaNome,
      assinaturaData: parsed.data.assinaturaData,
      anexos: JSON.stringify(parsed.data.anexos),
      valorTotal,
      itens: { create: parsed.data.itens },
      funcionarios: { connect: parsed.data.funcionariosIds.map((id) => ({ id })) },
    },
    include: { cliente: true, itens: true, funcionarios: true },
  });

  res.status(201).json(order);
});

router.put("/:id", async (req, res) => {
  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "OS invalida." });

  const valorTotal = parsed.data.itens.reduce(
    (sum, item) => sum + Number(item.valorUnitario) * item.quantidade,
    0
  );

  await prisma.serviceOrderItem.deleteMany({ where: { orderId: req.params.id } });

  const order = await prisma.serviceOrder.update({
    where: { id: req.params.id },
    data: {
      clienteId: parsed.data.clienteId,
      dataEvento: parsed.data.dataEvento,
      horarioInicio: parsed.data.horarioInicio,
      horarioFim: parsed.data.horarioFim,
      local: parsed.data.local,
      status: parsed.data.status,
      formaPagamento: parsed.data.formaPagamento,
      observacoes: parsed.data.observacoes,
      assinaturaNome: parsed.data.assinaturaNome,
      assinaturaData: parsed.data.assinaturaData,
      anexos: JSON.stringify(parsed.data.anexos),
      valorTotal,
      itens: { create: parsed.data.itens },
      funcionarios: { set: parsed.data.funcionariosIds.map((id) => ({ id })) },
    },
    include: { cliente: true, itens: true, funcionarios: true },
  });

  res.json(order);
});

router.delete("/:id", async (req, res) => {
  await prisma.serviceOrder.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;