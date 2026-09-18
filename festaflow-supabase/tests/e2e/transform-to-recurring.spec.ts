import { test, expect, request } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../.env.test"), override: true });
const prisma = new PrismaClient();

// Every fixture here is created fresh per test (unique name/timestamp),
// never reusing/mutating the shared OS-TEST-* seed rows - same convention as
// clients-crud.spec.ts, so the suite stays safely re-runnable and this spec
// can never corrupt state another spec depends on.
async function newContext(storageState: "admin" | "operador" = "operador") {
  return request.newContext({ storageState: `tests/.auth/${storageState}.json`, baseURL: "http://localhost:3100" });
}

type Fixture = { client: { id: string }; service: { id: string }; employee: { id: string }; order: { id: string; code: string; eventDate: string; startTime: string; endTime: string } };

async function createOrder(branchId: string, storageState: "admin" | "operador" = "operador"): Promise<Fixture> {
  const ctx = await newContext(storageState);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const client = await ctx.post("/api/clients", { data: { branchId, name: `Cliente Transform ${suffix}`, addressStreet: "Rua de Teste", addressNumber: "10", addressNeighborhood: "Bairro Teste", addressCity: "Vitoria", addressState: "ES" } }).then((r) => r.json());
  const service = await ctx.post("/api/services", { data: { branchId, name: `Servico Transform ${suffix}`, price: 135, durationHours: 2, category: "Teste", active: true } }).then((r) => r.json());
  const employee = await ctx.post("/api/employees", { data: { branchId, name: `Funcionario Transform ${suffix}`, role: "Faxineira", dailyRate: 150 } }).then((r) => r.json());
  // UTC midnight, 14 days out - matches how Appointment.date (a @db.Date
  // column) ends up stored, so getUTCDay() on the response is unambiguous.
  const eventDate = new Date();
  eventDate.setUTCDate(eventDate.getUTCDate() + 14);
  const eventDateUtcMidnight = new Date(Date.UTC(eventDate.getUTCFullYear(), eventDate.getUTCMonth(), eventDate.getUTCDate()));
  const order = await ctx
    .post("/api/orders", { data: { branchId, clientId: client.id, eventDate: eventDateUtcMidnight.toISOString(), startTime: "09:00", endTime: "11:00", status: "agendado", employeeIds: [employee.id], items: [{ serviceId: service.id, quantity: 1, unitPrice: 135 }] } })
    .then((r) => r.json());
  await ctx.dispose();
  return { client, service, employee, order };
}

function transformPayload(fx: Fixture, overrides: Record<string, unknown> = {}) {
  const startDate = fx.order.eventDate.slice(0, 10);
  const endDate = new Date(fx.order.eventDate);
  endDate.setUTCDate(endDate.getUTCDate() + 21); // bounds generation to a handful of occurrences
  return {
    clientId: fx.client.id,
    serviceId: fx.service.id,
    frequency: "weekly",
    interval: 1,
    daysOfWeek: [new Date(fx.order.eventDate).getUTCDay()],
    startTime: fx.order.startTime,
    endTime: fx.order.endTime,
    price: 135,
    startDate,
    endDate: endDate.toISOString().slice(0, 10),
    employeeIds: [fx.employee.id],
    ...overrides,
  };
}

test.describe("Transformar OS em recorrencia (POST /api/orders/:id/transform-to-recurring)", () => {
  let branchAId: string;
  let branchBId: string;

  test.beforeAll(async () => {
    branchAId = (await prisma.branch.findUniqueOrThrow({ where: { name: "Filial Teste Norte" } })).id;
    branchBId = (await prisma.branch.findUniqueOrThrow({ where: { name: "Filial Teste Sul" } })).id;
  });

  test.afterAll(async () => prisma.$disconnect());

  test("mantem a MESMA OS, preserva o atendimento original e gera as novas ocorrencias sem duplicar datas", async () => {
    const fx = await createOrder(branchAId);
    const ctx = await newContext();

    const res = await ctx.post(`/api/orders/${fx.order.id}/transform-to-recurring`, { data: transformPayload(fx) });
    expect(res.ok()).toBe(true);
    const body = await res.json();

    // Same OS, never a new one.
    expect(body.order.id).toBe(fx.order.id);
    expect(body.order.code).toBe(fx.order.code);
    expect(body.generation.adopted).toBe(1); // the original atendimento was adopted, not duplicated

    const schedules = await prisma.recurringSchedule.findMany({ where: { orderId: fx.order.id } });
    expect(schedules).toHaveLength(1);

    const appointments = await prisma.appointment.findMany({ where: { orderId: fx.order.id } });
    const dateKeys = appointments.map((a) => a.date.toISOString().slice(0, 10));
    expect(new Set(dateKeys).size).toBe(dateKeys.length); // no duplicate dates
    expect(dateKeys).toContain(fx.order.eventDate.slice(0, 10)); // original date still present
    expect(appointments.length).toBeGreaterThan(1); // original + at least one new occurrence
    expect(appointments.every((a) => a.recurringScheduleId === schedules[0].id)).toBe(true);

    await ctx.dispose();
  });

  test("uma OS que ja possui recorrencia nao pode ser transformada de novo", async () => {
    const fx = await createOrder(branchAId);
    const ctx = await newContext();
    const payload = transformPayload(fx);

    const first = await ctx.post(`/api/orders/${fx.order.id}/transform-to-recurring`, { data: payload });
    expect(first.ok()).toBe(true);

    const second = await ctx.post(`/api/orders/${fx.order.id}/transform-to-recurring`, { data: payload });
    expect(second.status()).toBe(422);
    const body = await second.json();
    expect(body.message).toMatch(/ja possui uma recorrencia/i);

    const schedules = await prisma.recurringSchedule.findMany({ where: { orderId: fx.order.id } });
    expect(schedules).toHaveLength(1); // the rejected second call never created a second row

    await ctx.dispose();
  });

  test("uma OS Realizada nao pode ser transformada diretamente (usar 'Criar recorrencia a partir desta OS')", async () => {
    const fx = await createOrder(branchAId);
    const ctx = await newContext();
    await ctx.put(`/api/orders/${fx.order.id}`, { data: { clientId: fx.client.id, eventDate: fx.order.eventDate, startTime: fx.order.startTime, endTime: fx.order.endTime, status: "realizado", employeeIds: [fx.employee.id], items: [{ serviceId: fx.service.id, quantity: 1, unitPrice: 135 }] } });

    const res = await ctx.post(`/api/orders/${fx.order.id}/transform-to-recurring`, { data: transformPayload(fx) });
    expect(res.status()).toBe(422);
    const body = await res.json();
    expect(body.message).toMatch(/Realizada/);

    expect(await prisma.recurringSchedule.count({ where: { orderId: fx.order.id } })).toBe(0);
    await ctx.dispose();
  });

  test("uma OS cancelada nao pode ser transformada", async () => {
    const fx = await createOrder(branchAId);
    const ctx = await newContext();
    await ctx.post(`/api/orders/${fx.order.id}/cancel`, { data: { reason: "Cancelamento de teste E2E" } });

    const res = await ctx.post(`/api/orders/${fx.order.id}/transform-to-recurring`, { data: transformPayload(fx) });
    expect(res.status()).toBe(422);
    const body = await res.json();
    expect(body.message).toMatch(/cancelada/i);

    expect(await prisma.recurringSchedule.count({ where: { orderId: fx.order.id } })).toBe(0);
    await ctx.dispose();
  });

  test("rejeita um servico que nao foi contratado nesta OS", async () => {
    const fx = await createOrder(branchAId);
    const ctx = await newContext();
    const otherService = await ctx.post("/api/services", { data: { branchId: branchAId, name: `Servico Nao Contratado ${Date.now()}`, price: 50, durationHours: 1, category: "Teste", active: true } }).then((r) => r.json());

    const res = await ctx.post(`/api/orders/${fx.order.id}/transform-to-recurring`, { data: transformPayload(fx, { serviceId: otherService.id }) });
    expect(res.status()).toBe(422);
    const body = await res.json();
    expect(body.field).toBe("serviceId");

    await ctx.dispose();
  });

  test("clicar duas vezes seguidas (mesma requisicao em paralelo) nunca cria duas recorrencias", async () => {
    const fx = await createOrder(branchAId);
    const ctx = await newContext();
    const payload = transformPayload(fx);

    const [r1, r2] = await Promise.all([
      ctx.post(`/api/orders/${fx.order.id}/transform-to-recurring`, { data: payload }),
      ctx.post(`/api/orders/${fx.order.id}/transform-to-recurring`, { data: payload }),
    ]);
    const statuses = [r1.status(), r2.status()].sort();
    expect(statuses[0]).toBe(200); // exactly one succeeds
    expect(statuses[1]).toBeGreaterThanOrEqual(400); // the other is rejected, not silently duplicated

    const schedules = await prisma.recurringSchedule.findMany({ where: { orderId: fx.order.id } });
    expect(schedules).toHaveLength(1);
    const appointments = await prisma.appointment.findMany({ where: { orderId: fx.order.id, recurringScheduleId: { not: null } } });
    const dateKeys = appointments.map((a) => a.date.toISOString().slice(0, 10));
    expect(new Set(dateKeys).size).toBe(dateKeys.length);

    await ctx.dispose();
  });

  test("IDOR: operador (so tem acesso a Filial Teste Norte) recebe 404 ao tentar transformar uma OS de outra filial", async () => {
    // Cria a OS na Filial Sul com o contexto do admin (o unico com acesso as
    // 2 filiais - operador nao poderia nem criar aqui), depois tenta
    // transforma-la como operador.
    const fx = await createOrder(branchBId, "admin");
    const ctx = await newContext("operador");
    const res = await ctx.post(`/api/orders/${fx.order.id}/transform-to-recurring`, { data: transformPayload(fx) });
    expect(res.status()).toBe(404);
    // Confirms the 404 really is branch isolation, not a mutation that happened anyway.
    expect(await prisma.recurringSchedule.count({ where: { orderId: fx.order.id } })).toBe(0);
    await ctx.dispose();
  });
});
