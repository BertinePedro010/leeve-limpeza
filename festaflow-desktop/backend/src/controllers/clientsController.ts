import { Request, Response } from "express";
import { prisma } from "../prisma";

export async function listClients(_req: Request, res: Response) {
  const data = await prisma.client.findMany({ orderBy: { nome: "asc" }, include: { orders: true } });
  res.json(data);
}

export async function createClient(req: Request, res: Response) {
  const data = await prisma.client.create({ data: req.body });
  res.status(201).json(data);
}

export async function updateClient(req: Request, res: Response) {
  const data = await prisma.client.update({ where: { id: req.params.id }, data: req.body });
  res.json(data);
}

export async function deleteClient(req: Request, res: Response) {
  await prisma.client.delete({ where: { id: req.params.id } });
  res.status(204).send();
}
