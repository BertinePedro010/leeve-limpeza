import { test, expect, request } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../.env.test"), override: true });
const prisma = new PrismaClient();

// Every fixture here is created fresh per test (unique name/timestamp), same
// convention as reschedule-appointment.spec.ts / transform-to-recurring.spec.ts.
async function newContext(storageState: "admin" | "operador" = "operador") {
  return request.newContext({ storageState: `tests/.auth/${storageState}.json`, baseURL: "http://localhost:3100" });
}

function utcDate(daysFromNow: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

type Fixture = { client: { id: string }; service: { id: string; price: string | number }; employee: { id: string }; order: { id: string; code: string; eventDate: string; startTime: string; endTime: string } };

async function createOrder(branchId: string, unitPrice: number): Promise<Fixture> {
  const ctx = await newContext();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const client = await ctx.post("/api/clients", { data: { branchId, name: `Cliente Valor ${suffix}`, addressStreet: "Rua de Teste", addressNumber: "10", addressNeighborhood: "Bairro Teste", addressCity: "Vitoria", addressState: "ES" } }).then((r) => r.json());
  const service = await ctx.post("/api/services", { data: { branchId, name: `Servico Valor ${suffix}`, price: 500, durationHours: 2, category: "Teste", active: true } }).then((r) => r.json());
  const employee = await ctx.post("/api/employees", { data: { branchId, name: `Funcionario Valor ${suffix}`, role: "Faxineira", dailyRate: 150 } }).then((r) => r.json());
  const eventDate = utcDate(14);
  const order = await ctx
    .post("/api/orders", { data: { branchId, clientId: client.id, eventDate: eventDate.toISOString(), startTime: "09:00", endTime: "11:00", status: "agendado", employeeIds: [employee.id], items: [{ serviceId: service.id, quantity: 1, unitPrice }] } })
    .then((r) => r.json());
  await ctx.dispose();
  return { client, service, employee, order };
}

function orderEditPayload(fx: Fixture, unitPrice: number, overrides: Record<string, unknown> = {}) {
  return { clientId: fx.client.id, eventDate: fx.order.eventDate, startTime: fx.order.startTime, endTime: fx.order.endTime, status: "agendado", employeeIds: [fx.employee.id], items: [{ serviceId: fx.service.id, quantity: 1, unitPrice }], ...overrides };
}

test.describe("Editar o valor (unitPrice) de um servico na OS", () => {
  let branchAId: string;

  test.beforeAll(async () => {
    branchAId = (await prisma.branch.findUniqueOrThrow({ where: { name: "Filial Teste Norte" } })).id;
  });

  test.afterAll(async () => prisma.$disconnect());

  test("Criacao: um unitPrice diferente do preco padrao do servico e persistido e usado no total, sem alterar Service.price", async () => {
    const fx = await createOrder(branchAId, 650); // Service.price is 500 (see createOrder)
    const stored = await prisma.serviceOrderItem.findFirstOrThrow({ where: { orderId: fx.order.id } });
    expect(Number(stored.unitPrice)).toBe(650);
    const order = await prisma.serviceOrder.findUniqueOrThrow({ where: { id: fx.order.id } });
    expect(Number(order.totalAmount)).toBe(650);
    const service = await prisma.service.findUniqueOrThrow({ where: { id: fx.service.id } });
    expect(Number(service.price)).toBe(500); // catalog price untouched
  });

  test("OS Agendada: editar o unitPrice via PUT recalcula o total e nao mexe no preco padrao do servico", async () => {
    const fx = await createOrder(branchAId, 500);
    const ctx = await newContext();

    const res = await ctx.put(`/api/orders/${fx.order.id}`, { data: orderEditPayload(fx, 720) });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(Number(body.totalAmount)).toBe(720);
    expect(Number(body.items[0].unitPrice)).toBe(720);

    const service = await prisma.service.findUniqueOrThrow({ where: { id: fx.service.id } });
    expect(Number(service.price)).toBe(500);

    await ctx.dispose();
  });

  test("OS Realizada: editar o unitPrice atualiza o total E a Transaction de receita automatica, sem duplicar nem mudar status", async () => {
    const fx = await createOrder(branchAId, 500);
    const ctx = await newContext();

    const completeRes = await ctx.put(`/api/orders/${fx.order.id}`, { data: orderEditPayload(fx, 500, { status: "realizado" }) });
    expect(completeRes.ok()).toBe(true);
    const txBefore = await prisma.transaction.findFirstOrThrow({ where: { orderId: fx.order.id, isAutoRevenue: true } });
    expect(Number(txBefore.amount)).toBe(500);

    const res = await ctx.put(`/api/orders/${fx.order.id}`, { data: orderEditPayload(fx, 900, { status: "realizado" }) });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.status).toBe("realizado"); // status never changed by a price edit
    expect(Number(body.totalAmount)).toBe(900);

    const txsAfter = await prisma.transaction.findMany({ where: { orderId: fx.order.id, isAutoRevenue: true, deletedAt: null } });
    expect(txsAfter).toHaveLength(1); // never a duplicate/second charge
    expect(txsAfter[0].id).toBe(txBefore.id); // same row, updated in place
    expect(Number(txsAfter[0].amount)).toBe(900); // reflects the new value

    const service = await prisma.service.findUniqueOrThrow({ where: { id: fx.service.id } });
    expect(Number(service.price)).toBe(500); // catalog price still untouched, even on a realizado OS

    await ctx.dispose();
  });

  test("Validacao: unitPrice negativo e rejeitado", async () => {
    const fx = await createOrder(branchAId, 500);
    const ctx = await newContext();

    const res = await ctx.put(`/api/orders/${fx.order.id}`, { data: orderEditPayload(fx, -10) });
    expect(res.status()).toBe(422);
    const body = await res.json();
    expect(body.field).toBe("items");

    const stored = await prisma.serviceOrderItem.findFirstOrThrow({ where: { orderId: fx.order.id } });
    expect(Number(stored.unitPrice)).toBe(500); // rejected, unchanged

    await ctx.dispose();
  });
});
