import { Request, Response } from "express";
import { prisma } from "../prisma";

export async function summary(_req: Request, res: Response) {
  const [orders, clients, employees, services, transactions] = await Promise.all([
    prisma.serviceOrder.findMany({ include: { itens: true, funcionarios: true } }),
    prisma.client.findMany(),
    prisma.employee.findMany(),
    prisma.service.findMany(),
    prisma.transaction.findMany(),
  ]);

  const receitas = transactions.filter((t) => t.tipo === "receita" && t.status === "pago").reduce((s, t) => s + Number(t.valor), 0);
  const despesas = transactions.filter((t) => t.tipo === "despesa" && t.status === "pago").reduce((s, t) => s + Number(t.valor), 0);
  const contasReceber = transactions.filter((t) => t.tipo === "receita" && t.status === "pendente").reduce((s, t) => s + Number(t.valor), 0);
  const contasPagar = transactions.filter((t) => t.tipo === "despesa" && t.status === "pendente").reduce((s, t) => s + Number(t.valor), 0);

  res.json({
    faturamento: receitas,
    despesas,
    lucro: receitas - despesas,
    contasReceber,
    contasPagar,
    eventos: orders.length,
    ordensAtivas: orders.filter((o) => !["FINALIZADO", "CANCELADO"].includes(o.status)).length,
    eventosConcluidos: orders.filter((o) => o.status === "FINALIZADO").length,
    clientes: clients.length,
    funcionarios: employees.length,
    servicos: services.length,
    proximosEventos: orders.filter((o) => !["FINALIZADO", "CANCELADO"].includes(o.status)).slice(0, 5),
  });
}