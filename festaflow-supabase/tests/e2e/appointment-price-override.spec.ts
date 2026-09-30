import { test, expect, request } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../.env.test"), override: true });
const prisma = new PrismaClient();

async function newContext(storageState: "admin" | "operador" = "operador") {
  return request.newContext({ storageState: `tests/.auth/${storageState}.json`, baseURL: "http://localhost:3100" });
}

function utcDate(daysFromNow: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Covers the "REGRA FUNDAMENTAL" requirement: clicking one occurrence of a
// recurrence and editing its value must change ONLY that occurrence - never
// the sibling occurrences, the OS's own items/totalAmount, or the
// recurrence's own template (RecurringSchedule.price). Mirrors the example:
// 4 weekly occurrences all at the OS's default value, edit the 2nd one only.
test.describe("Editar o valor de UMA ocorrencia de recorrencia (PUT /api/appointments/:id priceOverride)", () => {
  let branchAId: string;

  test.beforeAll(async () => {
    branchAId = (await prisma.branch.findUniqueOrThrow({ where: { name: "Filial Teste Norte" } })).id;
  });

  test.afterAll(async () => prisma.$disconnect());

  async function createRecurrenceWithOccurrences() {
    const ctx = await newContext();
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const client = await ctx.post("/api/clients", { data: { branchId: branchAId, name: `Cliente Override ${suffix}`, addressStreet: "Rua de Teste", addressNumber: "10", addressNeighborhood: "Bairro Teste", addressCity: "Vitoria", addressState: "ES" } }).then((r) => r.json());
    const service = await ctx.post("/api/services", { data: { branchId: branchAId, name: `Servico Override ${suffix}`, price: 500, durationHours: 2, category: "Teste", active: true } }).then((r) => r.json());
    const employee = await ctx.post("/api/employees", { data: { branchId: branchAId, name: `Funcionario Override ${suffix}`, role: "Faxineira", dailyRate: 150 } }).then((r) => r.json());
    const monday = utcDate((8 - utcDate(14).getUTCDay()) % 7 + 14);
    const endDate = new Date(monday);
    endDate.setUTCDate(endDate.getUTCDate() + 21); // 4 weekly occurrences: +0, +7, +14, +21 days from `monday`
    const result = await ctx
      .post("/api/recurring-schedules", { data: { branchId: branchAId, clientId: client.id, serviceId: service.id, frequency: "weekly", interval: 1, daysOfWeek: [monday.getUTCDay()], startTime: "09:00", endTime: "11:00", price: 2000, startDate: ymd(monday), endDate: ymd(endDate), employeeIds: [employee.id] } })
      .then((r) => r.json());
    await ctx.dispose();
    return { client, service, employee, order: result.order, schedule: result.schedule };
  }

  test("Editar o valor do atendimento clicado nao altera os demais, a OS, nem a recorrencia", async () => {
    const fx = await createRecurrenceWithOccurrences();
    const ctx = await newContext();

    const appointmentsBefore = await prisma.appointment.findMany({ where: { recurringScheduleId: fx.schedule.id }, orderBy: { date: "asc" } });
    // At least 3 occurrences needed to prove "the middle one only" (mirrors
    // the user's 05/10-07/10-09/10-12/10 example) - not just "first vs last".
    expect(appointmentsBefore.length).toBeGreaterThanOrEqual(3);
    for (const a of appointmentsBefore) expect(a.priceOverride).toBeNull();

    const orderBefore = await prisma.serviceOrder.findUniqueOrThrow({ where: { id: fx.order.id } });
    const itemsBefore = await prisma.serviceOrderItem.findMany({ where: { orderId: fx.order.id } });
    const scheduleBefore = await prisma.recurringSchedule.findUniqueOrThrow({ where: { id: fx.schedule.id } });

    const target = appointmentsBefore[1]; // the "clicked" occurrence - neither first nor last
    const originalValue = Number(orderBefore.totalAmount);
    const overriddenValue = originalValue + 150;

    const res = await ctx.put(`/api/appointments/${target.id}`, { data: { priceOverride: overriddenValue } });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(Number(body.priceOverride)).toBe(overriddenValue);

    // Only the clicked occurrence changed - every sibling stays at null
    // (inheriting the OS's value), exactly like before the edit.
    const appointmentsAfter = await prisma.appointment.findMany({ where: { recurringScheduleId: fx.schedule.id }, orderBy: { date: "asc" } });
    for (const a of appointmentsAfter) {
      if (a.id === target.id) expect(Number(a.priceOverride)).toBe(overriddenValue);
      else expect(a.priceOverride).toBeNull();
    }

    // The OS's own items/totalAmount never moved.
    const itemsAfter = await prisma.serviceOrderItem.findMany({ where: { orderId: fx.order.id } });
    expect(itemsAfter).toHaveLength(itemsBefore.length);
    expect(Number(itemsAfter[0].unitPrice)).toBe(Number(itemsBefore[0].unitPrice));
    const orderAfter = await prisma.serviceOrder.findUniqueOrThrow({ where: { id: fx.order.id } });
    expect(Number(orderAfter.totalAmount)).toBe(Number(orderBefore.totalAmount));

    // The recurrence's own template ("valor mensal") never moved either.
    const scheduleAfter = await prisma.recurringSchedule.findUniqueOrThrow({ where: { id: fx.schedule.id } });
    expect(Number(scheduleAfter.price)).toBe(Number(scheduleBefore.price));

    // The OS's real total (GET /api/orders/:id, see lib/order-total.ts)
    // reflects exactly one overridden occurrence, the rest at the default.
    const getRes = await ctx.get(`/api/orders/${fx.order.id}`);
    const orderBody = await getRes.json();
    const expectedTotal = (appointmentsBefore.length - 1) * originalValue + overriddenValue;
    expect(Number(orderBody.total)).toBeCloseTo(expectedTotal, 2);

    await ctx.dispose();
  });

  test("Restaurar valor padrao: priceOverride null volta a ocorrencia a herdar o valor da OS", async () => {
    const fx = await createRecurrenceWithOccurrences();
    const ctx = await newContext();
    const appointments = await prisma.appointment.findMany({ where: { recurringScheduleId: fx.schedule.id }, orderBy: { date: "asc" } });
    const target = appointments[1];

    const setRes = await ctx.put(`/api/appointments/${target.id}`, { data: { priceOverride: 999 } });
    expect(setRes.ok()).toBe(true);
    let stored = await prisma.appointment.findUniqueOrThrow({ where: { id: target.id } });
    expect(Number(stored.priceOverride)).toBe(999);

    const clearRes = await ctx.put(`/api/appointments/${target.id}`, { data: { priceOverride: null } });
    expect(clearRes.ok()).toBe(true);
    stored = await prisma.appointment.findUniqueOrThrow({ where: { id: target.id } });
    expect(stored.priceOverride).toBeNull();

    await ctx.dispose();
  });

  test("Validacao: priceOverride negativo e rejeitado", async () => {
    const fx = await createRecurrenceWithOccurrences();
    const ctx = await newContext();
    const appointments = await prisma.appointment.findMany({ where: { recurringScheduleId: fx.schedule.id }, orderBy: { date: "asc" } });

    const res = await ctx.put(`/api/appointments/${appointments[0].id}`, { data: { priceOverride: -1 } });
    expect(res.status()).toBe(422);
    const stored = await prisma.appointment.findUniqueOrThrow({ where: { id: appointments[0].id } });
    expect(stored.priceOverride).toBeNull(); // rejected, unchanged

    await ctx.dispose();
  });

  test("IDOR: operador (so tem acesso a Filial Teste Norte) recebe 404 ao editar valor de atendimento de outra filial", async () => {
    const branchB = await prisma.branch.findUniqueOrThrow({ where: { name: "Filial Teste Sul" } });
    const adminCtx = await newContext("admin");
    const suffix = `${Date.now()}`;
    const client = await adminCtx.post("/api/clients", { data: { branchId: branchB.id, name: `Cliente B ${suffix}`, addressStreet: "Rua B", addressNumber: "1", addressNeighborhood: "Bairro B", addressCity: "Vila Velha", addressState: "ES" } }).then((r) => r.json());
    const service = await adminCtx.post("/api/services", { data: { branchId: branchB.id, name: `Servico B ${suffix}`, price: 100, durationHours: 1, category: "Teste", active: true } }).then((r) => r.json());
    const employee = await adminCtx.post("/api/employees", { data: { branchId: branchB.id, name: `Funcionario B ${suffix}`, role: "Faxineira", dailyRate: 100 } }).then((r) => r.json());
    const eventDate = utcDate(10);
    const order = await adminCtx
      .post("/api/orders", { data: { branchId: branchB.id, clientId: client.id, eventDate: eventDate.toISOString(), startTime: "09:00", endTime: "10:00", status: "agendado", employeeIds: [employee.id], items: [{ serviceId: service.id, quantity: 1, unitPrice: 100 }] } })
      .then((r) => r.json());
    await adminCtx.dispose();

    const ctx = await newContext("operador");
    const res = await ctx.put(`/api/appointments/${order.appointments[0].id}`, { data: { priceOverride: 500 } });
    expect(res.status()).toBe(404);
    await ctx.dispose();
  });
});
