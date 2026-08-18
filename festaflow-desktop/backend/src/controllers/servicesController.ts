import { Request, Response } from "express";
import { prisma } from "../prisma";

export async function listServices(_req: Request, res: Response) {
  const data = await prisma.service.findMany({ orderBy: [{ categoria: "asc" }, { nome: "asc" }] });
  res.json(data);
}

export async function createService(req: Request, res: Response) {
  const data = await prisma.service.create({ data: req.body });
  res.status(201).json(data);
}

export async function updateService(req: Request, res: Response) {
  const data = await prisma.service.update({ where: { id: req.params.id }, data: req.body });
  res.json(data);
}

export async function deleteService(req: Request, res: Response) {
  await prisma.service.delete({ where: { id: req.params.id } });
  res.status(204).send();
}
