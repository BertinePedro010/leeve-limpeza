import { test, expect, request } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../.env.test"), override: true });
const prisma = new PrismaClient();

// Mesmo princípio de totals-consistency.spec.ts: calcula o esperado direto no
// banco, de forma independente da query da rota (nunca copiado de
// app/api/dashboard/route.ts), para pegar divergências reais em vez de só
// reafirmar a própria lógica da rota. OS-TEST-0008/0009 (prisma/seed.test.ts)
// existem exatamente para dar a este teste um "mes anterior" determinístico
// na Filial Teste Norte, livre do ruído das 3 ocorrências da recorrência
// semanal (cujas datas - hoje+7/14/21 dias - podem cair no mês atual OU no
// seguinte dependendo do dia em que a suíte roda).
async function expectedForMonth(branchId: string, year: number, month: number) {
  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 0, 23, 59, 59, 999);
  const rows = await prisma.appointment.findMany({
    where: { branchId, cancelledAt: null, date: { gte: from, lte: to }, order: { deletedAt: null } },
    select: {
      status: true,
      priceOverride: true,
      order: { select: { totalAmount: true, items: { orderBy: { createdAt: "asc" }, take: 1, select: { service: { select: { category: true } } } } } },
    },
  });
  const buckets = { agendado: { count: 0, total: 0 }, realizado: { count: 0, total: 0 } };
  const byCategory = new Map<string, { count: number; total: number }>();
  for (const r of rows) {
    const value = Number(r.priceOverride ?? r.order.totalAmount);
    const bucket = buckets[r.status as "agendado" | "realizado"];
    bucket.count += 1;
    bucket.total += value;
    const category = r.order.items[0]?.service.category ?? "Sem categoria";
    const entry = byCategory.get(category) ?? { count: 0, total: 0 };
    entry.count += 1;
    entry.total += value;
    byCategory.set(category, entry);
  }
  return {
    buckets,
    byCategory,
    totalCount: buckets.agendado.count + buckets.realizado.count,
    totalValue: buckets.agendado.total + buckets.realizado.total,
  };
}

test.describe("Dashboard mensal: /api/dashboard?month=&year= vs. banco", () => {
  let branchAId: string;
  let branchBId: string;
  let lastMonthYear: number;
  let lastMonthMonth: number; // 1-12
  let twoMonthsAgoYear: number;
  let twoMonthsAgoMonth: number;

  test.beforeAll(async () => {
    const branchA = await prisma.branch.findUniqueOrThrow({ where: { name: "Filial Teste Norte" } });
    const branchB = await prisma.branch.findUniqueOrThrow({ where: { name: "Filial Teste Sul" } });
    branchAId = branchA.id;
    branchBId = branchB.id;
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    lastMonthYear = lastMonth.getFullYear();
    lastMonthMonth = lastMonth.getMonth() + 1;
    const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    twoMonthsAgoYear = twoMonthsAgo.getFullYear();
    twoMonthsAgoMonth = twoMonthsAgo.getMonth() + 1;
  });

  test.afterAll(async () => prisma.$disconnect());

  test("occurrences e occurrencesByCategory do mes anterior batem com o banco (OS-TEST-0008/0009)", async () => {
    const ctx = await request.newContext({ storageState: "tests/.auth/admin.json", baseURL: "http://localhost:3100" });
    const res = await ctx.get(`/api/dashboard?branchId=${branchAId}&month=${lastMonthMonth}&year=${lastMonthYear}`);
    expect(res.ok()).toBe(true);
    const dashboard = await res.json();
    const expected = await expectedForMonth(branchAId, lastMonthYear, lastMonthMonth);

    expect(dashboard.period).toEqual({ year: lastMonthYear, month: lastMonthMonth });
    expect(dashboard.occurrences.total.count).toBe(expected.totalCount);
    expect(dashboard.occurrences.total.total).toBeCloseTo(expected.totalValue, 2);
    expect(dashboard.occurrences.scheduled.count).toBe(expected.buckets.agendado.count);
    expect(dashboard.occurrences.scheduled.total).toBeCloseTo(expected.buckets.agendado.total, 2);
    expect(dashboard.occurrences.finalized.count).toBe(expected.buckets.realizado.count);
    expect(dashboard.occurrences.finalized.total).toBeCloseTo(expected.buckets.realizado.total, 2);

    // OS-TEST-0008 (Residencial) + OS-TEST-0009 (Especializada) devem aparecer
    // como categorias distintas, cada ocorrência contada uma única vez.
    expect(expected.byCategory.size).toBeGreaterThanOrEqual(2);
    for (const [category, bucket] of expected.byCategory) {
      const row = dashboard.occurrencesByCategory.find((r: { category: string }) => r.category === category);
      expect(row, `categoria "${category}" ausente no detalhamento por tipo de OS`).toBeTruthy();
      expect(row.count).toBe(bucket.count);
      expect(row.total).toBeCloseTo(bucket.total, 2);
    }
    // A soma do detalhamento por categoria tem que reconciliar com o total -
    // nenhuma ocorrência deve "desaparecer" nem ser contada duas vezes.
    const categorySum = (dashboard.occurrencesByCategory as Array<{ count: number; total: number }>).reduce(
      (acc, r) => ({ count: acc.count + r.count, total: acc.total + r.total }),
      { count: 0, total: 0 }
    );
    expect(categorySum.count).toBe(dashboard.occurrences.total.count);
    expect(categorySum.total).toBeCloseTo(dashboard.occurrences.total.total, 2);
    await ctx.dispose();
  });

  test("trocar o mes muda os totais (dois meses atrás não tem nenhuma das OS criadas para este teste)", async () => {
    const ctx = await request.newContext({ storageState: "tests/.auth/admin.json", baseURL: "http://localhost:3100" });
    const [resPrev, resTwoAgo] = await Promise.all([
      ctx.get(`/api/dashboard?branchId=${branchAId}&month=${lastMonthMonth}&year=${lastMonthYear}`),
      ctx.get(`/api/dashboard?branchId=${branchAId}&month=${twoMonthsAgoMonth}&year=${twoMonthsAgoYear}`),
    ]);
    const dashPrev = await resPrev.json();
    const dashTwoAgo = await resTwoAgo.json();
    const expectedTwoAgo = await expectedForMonth(branchAId, twoMonthsAgoYear, twoMonthsAgoMonth);

    expect(dashPrev.occurrences.total.count).toBeGreaterThanOrEqual(2); // OS-TEST-0008 + OS-TEST-0009
    expect(dashTwoAgo.occurrences.total.count).toBe(expectedTwoAgo.totalCount);
    expect(dashTwoAgo.occurrences.total.count).not.toBe(dashPrev.occurrences.total.count);
    await ctx.dispose();
  });

  test("IDOR: branchId de outra filial com month/year continua bloqueado (403), o filtro de periodo nao abre brecha de isolamento", async () => {
    const ctx = await request.newContext({ storageState: "tests/.auth/operador.json", baseURL: "http://localhost:3100" });
    const res = await ctx.get(`/api/dashboard?branchId=${branchBId}&month=${lastMonthMonth}&year=${lastMonthYear}`);
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  test("mes invalido e rejeitado (422), nunca silenciosamente ignorado/substituido pelo atual", async () => {
    const ctx = await request.newContext({ storageState: "tests/.auth/admin.json", baseURL: "http://localhost:3100" });
    const res = await ctx.get(`/api/dashboard?branchId=${branchAId}&month=13&year=${lastMonthYear}`);
    expect(res.status()).toBe(422);
    await ctx.dispose();
  });
});
