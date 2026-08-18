import { Request, Response } from "express";
import { prisma } from "../prisma";

export async function listEmployees(_req: Request, res: Response) {
  const data = await prisma.employee.findMany({ orderBy: { nome: "asc" }, include: { orders: true } });
  res.json(data);
}

export async function createEmployee(req: Request, res: Response) {
  const data = await prisma.employee.create({ data: req.body });
  res.status(201).json(data);
}

export async function updateEmployee(req: Request, res: Response) {
  const data = await prisma.employee.update({ where: { id: req.params.id }, data: req.body });
  res.json(data);
}

export async function deleteEmployee(req: Request, res: Response) {
  await prisma.employee.delete({ where: { id: req.params.id } });
  res.status(204).send();
}
