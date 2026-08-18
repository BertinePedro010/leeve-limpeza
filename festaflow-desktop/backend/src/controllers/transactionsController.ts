import { Request, Response } from "express";
import { prisma } from "../prisma";

export async function listTransactions(_req: Request, res: Response) {
  const data = await prisma.transaction.findMany({ orderBy: { data: "desc" }, include: { order: true } });
  res.json(data);
}

export async function createTransaction(req: Request, res: Response) {
  const data = await prisma.transaction.create({ data: req.body });
  res.status(201).json(data);
}

export async function updateTransaction(req: Request, res: Response) {
  const data = await prisma.transaction.update({ where: { id: req.params.id }, data: req.body });
  res.json(data);
}

export async function deleteTransaction(req: Request, res: Response) {
  await prisma.transaction.delete({ where: { id: req.params.id } });
  res.status(204).send();
}
