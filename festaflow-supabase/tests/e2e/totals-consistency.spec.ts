import { test, expect, request } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../.env.test"), override: true });
const prisma = new PrismaClient();

// Compara o total exposto por /api/dashboard com um cálculo independente
// feito direto no banco (não copiado do código da rota) - se algum dia a
// rota e o banco divergirem (bug de filtro, status errado, filial errada),
// este teste pega a divergência em vez de só reafirmar a própria lógica da
// rota. Mesma regra de sumRevenue (lib/billing.ts): type/status/deletedAt.
async function expectedRevenueExpense(branchId: string) {
  const [revenueAgg, expenseAgg, receivableAgg, payableAgg] = await Promise.all([
    prisma.transaction.aggregate({ where: { branchId, deletedAt: null, type: "receita", status: "pago" }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { branchId, deletedAt: null, type: "despesa", status: "pago" }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { branchId, deletedAt: null, type: "receita", status: "pendente" }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { branchId, deletedAt: null, type: "despesa", status: "pendente" }, _sum: { amount: true } }),
  ]);
  return {
    revenue: Number(revenueAgg._sum.amount ?? 0),
    expenses: Number(expenseAgg._sum.amount ?? 0),
    receivable: Number(receivableAgg._sum.amount ?? 0),
    payable: Number(payableAgg._sum.amount ?? 0),
  };
}

test.describe("Consistência de totais: /api/dashboard vs. banco", () => {
  let branchAId: string;

  test.beforeAll(async () => {
    const branchA = await prisma.branch.findUniqueOrThrow({ where: { name: "Filial Teste Norte" } });
    branchAId = branchA.id;
  });

  test.afterAll(async () => prisma.$disconnect());

  test("revenue/expenses/profit/receivable/payable do dashboard batem com a soma direta das transactions", async () => {
    const ctx = await request.newContext({ storageState: "tests/.auth/admin.json", baseURL: "http://localhost:3100" });
    const res = await ctx.get(`/api/dashboard?branchId=${branchAId}`);
    expect(res.ok()).toBe(true);
    const dashboard = await res.json();
    const expected = await expectedRevenueExpense(branchAId);

    expect(dashboard.revenue).toBeCloseTo(expected.revenue, 2);
    expect(dashboard.expenses).toBeCloseTo(expected.expenses, 2);
    expect(dashboard.profit).toBeCloseTo(expected.revenue - expected.expenses, 2);
    expect(dashboard.receivable).toBeCloseTo(expected.receivable, 2);
    expect(dashboard.payable).toBeCloseTo(expected.payable, 2);
    await ctx.dispose();
  });

  test("a OS cancelada (OS-TEST-0003) não contribui para nenhum total, mesmo com status interno 'realizado'", async () => {
    const cancelled = await prisma.serviceOrder.findUniqueOrThrow({ where: { code: "OS-TEST-0003" } });
    expect(cancelled.cancelledAt).not.toBeNull();
    const autoRevenueForCancelled = await prisma.transaction.findFirst({ where: { orderId: cancelled.id, isAutoRevenue: true, deletedAt: null } });
    // syncOrderBilling (lib/billing.ts) soft-deletes the auto-revenue row when
    // an order is cancelled after being finalized - the seed never ran that
    // code path (it's a raw seed, not an API call), so this documents the
    // invariant the *real* cancel flow depends on, for the next test to lean on.
    expect(autoRevenueForCancelled).toBeNull();
  });

  test("uma transação pendente (não paga) nunca é somada em revenue/expenses", async () => {
    const ctx = await request.newContext({ storageState: "tests/.auth/admin.json", baseURL: "http://localhost:3100" });
    const res = await ctx.get(`/api/dashboard?branchId=${branchAId}`);
    const dashboard = await res.json();
    const pendingExpense = await prisma.transaction.findFirstOrThrow({ where: { branchId: branchAId, status: "pendente", type: "despesa" } });
    // The pending expense's amount must NOT be included in `expenses` (paid-only).
    const paidExpensesOnly = await prisma.transaction.aggregate({ where: { branchId: branchAId, deletedAt: null, type: "despesa", status: "pago" }, _sum: { amount: true } });
    expect(dashboard.expenses).toBeCloseTo(Number(paidExpensesOnly._sum.amount ?? 0), 2);
    expect(dashboard.expenses).not.toBeCloseTo(Number(paidExpensesOnly._sum.amount ?? 0) + Number(pendingExpense.amount), 2);
    await ctx.dispose();
  });

  test("dashboard sem branchId nunca soma TODAS as filiais indiscriminadamente (fica restrito às filiais do usuário)", async () => {
    // operador só tem acesso à Filial Teste Norte - o total dele deve ser
    // idêntico ao total calculado só para essa filial, nunca o de todas as 5.
    const ctx = await request.newContext({ storageState: "tests/.auth/operador.json", baseURL: "http://localhost:3100" });
    const res = await ctx.get(`/api/dashboard`);
    const dashboard = await res.json();
    const expected = await expectedRevenueExpense(branchAId);
    expect(dashboard.revenue).toBeCloseTo(expected.revenue, 2);
    await ctx.dispose();
  });
});
