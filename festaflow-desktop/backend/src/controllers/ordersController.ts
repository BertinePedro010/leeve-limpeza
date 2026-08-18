import { Request, Response } from "express";
import { prisma } from "../prisma";

async function nextCode() {
  const year = new Date().getFullYear();
  const count = await prisma.serviceOrder.count();
  return `OS-${year}-${String(count + 1).padStart(4, "0")}`;
}

function orderInclude() {
  return { cliente: true, itens: { include: { service: true } }, funcionarios: true };
}

function totalFromItems(items: Array<{ quantidade: number; valorUnitario: number }>) {
  return items.reduce((sum, item) => sum + item.quantidade * Number(item.valorUnitario), 0);
}

export async function listOrders(_req: Request, res: Response) {
  const data = await prisma.serviceOrder.findMany({ orderBy: { dataEvento: "asc" }, include: orderInclude() });
  res.json(data);
}

export async function createOrder(req: Request, res: Response) {
  const { itens, funcionariosIds, anexos, ...body } = req.body;
  const valorTotal = totalFromItems(itens);
  const data = await prisma.serviceOrder.create({
    data: {
      ...body,
      codigo: await nextCode(),
      valorTotal,
      anexos: JSON.stringify(anexos || []),
      itens: { create: itens },
      funcionarios: { connect: (funcionariosIds || []).map((id: string) => ({ id })) },
    },
    include: orderInclude(),
  });
  res.status(201).json(data);
}

export async function updateOrder(req: Request, res: Response) {
  const { itens, funcionariosIds, anexos, ...body } = req.body;
  const valorTotal = totalFromItems(itens);
  await prisma.serviceOrderItem.deleteMany({ where: { orderId: req.params.id } });
  const data = await prisma.serviceOrder.update({
    where: { id: req.params.id },
    data: {
      ...body,
      valorTotal,
      anexos: JSON.stringify(anexos || []),
      itens: { create: itens },
      funcionarios: { set: (funcionariosIds || []).map((id: string) => ({ id })) },
    },
    include: orderInclude(),
  });
  res.json(data);
}

export async function deleteOrder(req: Request, res: Response) {
  await prisma.serviceOrder.delete({ where: { id: req.params.id } });
  res.status(204).send();
}
