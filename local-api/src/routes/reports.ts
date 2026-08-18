import { Router } from "express";
import { prisma } from "../prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/summary", async (_req, res) => {
  const [orders, clients, employees, services, transactions] = await Promise.all([
    prisma.serviceOrder.findMany({ include: { itens: true, funcionarios: true } }),
    prisma.client.count(),
    prisma.employee.count(),
    prisma.service.count(),
    prisma.transaction.findMany(),
  ]);

  const receitas = transactions
    .filter((t) => t.tipo === "receita" && t.status === "pago")
    .reduce((sum, t) => sum + Number(t.valor), 0);

  const despesas = transactions
    .filter((t) => t.tipo === "despesa" && t.status === "pago")
    .reduce((sum, t) => sum + Number(t.valor), 0);

  res.json({
    faturamento: receitas,
    despesas,
    lucro: receitas - despesas,
    eventos: orders.length,
    ordensAtivas: orders.filter((o) => !["FINALIZADO", "CANCELADO"].includes(o.status)).length,
    clientes: clients,
    funcionarios: employees,
    servicos: services,
  });
});

export default router;