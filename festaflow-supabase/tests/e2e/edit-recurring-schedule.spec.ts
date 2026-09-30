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

test.describe("Editar o servico/valor mensal de uma recorrencia (PUT /api/recurring-schedules/:id)", () => {
  let branchAId: string;

  test.beforeAll(async () => {
    branchAId = (await prisma.branch.findUniqueOrThrow({ where: { name: "Filial Teste Norte" } })).id;
  });

  test.afterAll(async () => prisma.$disconnect());

  async function createRecurrence() {
    const ctx = await newContext();
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const client = await ctx.post("/api/clients", { data: { branchId: branchAId, name: `Cliente Recorrencia ${suffix}`, addressStreet: "Rua de Teste", addressNumber: "10", addressNeighborhood: "Bairro Teste", addressCity: "Vitoria", addressState: "ES" } }).then((r) => r.json());
    const service = await ctx.post("/api/services", { data: { branchId: branchAId, name: `Servico Recorrencia ${suffix}`, price: 300, durationHours: 2, category: "Teste", active: true } }).then((r) => r.json());
    const otherService = await ctx.post("/api/services", { data: { branchId: branchAId, name: `Outro Servico ${suffix}`, price: 400, durationHours: 2, category: "Teste", active: true } }).then((r) => r.json());
    const employee = await ctx.post("/api/employees", { data: { branchId: branchAId, name: `Funcionario Recorrencia ${suffix}`, role: "Faxineira", dailyRate: 150 } }).then((r) => r.json());
    const monday = utcDate((8 - utcDate(14).getUTCDay()) % 7 + 14);
    const endDate = new Date(monday);
    endDate.setUTCDate(endDate.getUTCDate() + 21);
    const result = await ctx
      .post("/api/recurring-schedules", { data: { branchId: branchAId, clientId: client.id, serviceId: service.id, frequency: "weekly", interval: 1, daysOfWeek: [monday.getUTCDay()], startTime: "09:00", endTime: "11:00", price: 1200, startDate: ymd(monday), endDate: ymd(endDate), employeeIds: [employee.id] } })
      .then((r) => r.json());
    await ctx.dispose();
    return { client, service, otherService, employee, order: result.order, schedule: result.schedule };
  }

  test("Editar serviceId/price atualiza a recorrencia mas NUNCA os ServiceOrderItem/totalAmount/Appointment ja existentes (historico preservado)", async () => {
    const fx = await createRecurrence();
    const ctx = await newContext();
    const itemsBefore = await prisma.serviceOrderItem.findMany({ where: { orderId: fx.order.id } });
    const orderBefore = await prisma.serviceOrder.findUniqueOrThrow({ where: { id: fx.order.id } });
    const appointmentsBefore = await prisma.appointment.findMany({ where: { recurringScheduleId: fx.schedule.id }, orderBy: { date: "asc" } });
    expect(appointmentsBefore.length).toBeGreaterThan(0);

    const res = await ctx.put(`/api/recurring-schedules/${fx.schedule.id}`, { data: { serviceId: fx.otherService.id, price: 1500 } });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.serviceId).toBe(fx.otherService.id);
    expect(Number(body.price)).toBe(1500);

    // The recurrence's own "valor mensal"/service changed...
    const scheduleAfter = await prisma.recurringSchedule.findUniqueOrThrow({ where: { id: fx.schedule.id } });
    expect(scheduleAfter.serviceId).toBe(fx.otherService.id);
    expect(Number(scheduleAfter.price)).toBe(1500);

    // ...but nothing that already exists on the OS/appointments moved.
    const itemsAfter = await prisma.serviceOrderItem.findMany({ where: { orderId: fx.order.id } });
    expect(itemsAfter).toHaveLength(itemsBefore.length);
    expect(itemsAfter[0].serviceId).toBe(itemsBefore[0].serviceId);
    expect(Number(itemsAfter[0].unitPrice)).toBe(Number(itemsBefore[0].unitPrice));
    const orderAfter = await prisma.serviceOrder.findUniqueOrThrow({ where: { id: fx.order.id } });
    expect(Number(orderAfter.totalAmount)).toBe(Number(orderBefore.totalAmount));
    const appointmentsAfter = await prisma.appointment.findMany({ where: { recurringScheduleId: fx.schedule.id }, orderBy: { date: "asc" } });
    expect(appointmentsAfter).toHaveLength(appointmentsBefore.length); // no regeneration, no duplication
    expect(appointmentsAfter.map((a) => a.date.toISOString())).toEqual(appointmentsBefore.map((a) => a.date.toISOString()));

    await ctx.dispose();
  });

  test("Validacao: servico de outra filial e rejeitado", async () => {
    const fx = await createRecurrence();
    const branchB = await prisma.branch.findUniqueOrThrow({ where: { name: "Filial Teste Sul" } });
    const adminCtx = await newContext("admin");
    const foreignService = await adminCtx.post("/api/services", { data: { branchId: branchB.id, name: `Servico Filial B ${Date.now()}`, price: 100, durationHours: 1, category: "Teste", active: true } }).then((r) => r.json());
    await adminCtx.dispose();

    const ctx = await newContext();
    const res = await ctx.put(`/api/recurring-schedules/${fx.schedule.id}`, { data: { serviceId: foreignService.id, price: 100 } });
    expect(res.status()).toBe(422);

    const scheduleAfter = await prisma.recurringSchedule.findUniqueOrThrow({ where: { id: fx.schedule.id } });
    expect(scheduleAfter.serviceId).toBe(fx.service.id); // rejected, unchanged

    await ctx.dispose();
  });

  test("IDOR: operador (so tem acesso a Filial Teste Norte) recebe 404 ao editar recorrencia de outra filial", async () => {
    const branchB = await prisma.branch.findUniqueOrThrow({ where: { name: "Filial Teste Sul" } });
    const adminCtx = await newContext("admin");
    const suffix = `${Date.now()}`;
    const client = await adminCtx.post("/api/clients", { data: { branchId: branchB.id, name: `Cliente B ${suffix}`, addressStreet: "Rua B", addressNumber: "1", addressNeighborhood: "Bairro B", addressCity: "Vila Velha", addressState: "ES" } }).then((r) => r.json());
    const service = await adminCtx.post("/api/services", { data: { branchId: branchB.id, name: `Servico B ${suffix}`, price: 100, durationHours: 1, category: "Teste", active: true } }).then((r) => r.json());
    const monday = utcDate((8 - utcDate(14).getUTCDay()) % 7 + 14);
    const result = await adminCtx.post("/api/recurring-schedules", { data: { branchId: branchB.id, clientId: client.id, serviceId: service.id, frequency: "monthly", dayOfMonth: 10, startTime: "09:00", endTime: "10:00", price: 200, startDate: ymd(monday) } }).then((r) => r.json());
    await adminCtx.dispose();

    const ctx = await newContext("operador");
    const res = await ctx.put(`/api/recurring-schedules/${result.schedule.id}`, { data: { serviceId: service.id, price: 999 } });
    expect(res.status()).toBe(404);
    await ctx.dispose();
  });
});
