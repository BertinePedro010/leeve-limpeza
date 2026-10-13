// Regression coverage for the festaflow-supabase security audit
// (C:\Users\Pedro Bertine\security-audit-skill\leeve-limpeza\run-1\
// FINDINGS-DETAIL.md), findings F1-F6. F4/F5 required explicit business-rule
// approval before any behavior change - see the fix-session report for the
// approved rules these tests lock in.
import { test, expect, request } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../.env.test"), override: true });
const prisma = new PrismaClient();
const BASE_URL = "http://localhost:3100";

// Wide enough to cover every seeded OS-TEST-* fixture regardless of when the
// suite runs (mirrors the "mes anterior" pattern other specs already use,
// just widened to a multi-year window since F1/F3 don't need a specific
// month - only "some realized, paid revenue exists in range").
function wideRange() {
  const now = new Date();
  const from = new Date(now.getFullYear() - 2, 0, 1).toISOString().slice(0, 10);
  const to = new Date(now.getFullYear() + 1, 11, 31).toISOString().slice(0, 10);
  return `period=personalizado&from=${from}&to=${to}`;
}

test.describe("SECURITY-AUDIT F1 - /api/reports/os financial module gate", () => {
  test.afterAll(async () => prisma.$disconnect());

  test("usuario com apenas 'reports' (sem 'finance') nao recebe faturamento nem valores por OS", async () => {
    const ctx = await request.newContext({ storageState: "tests/.auth/relatorios.json", baseURL: BASE_URL });
    const res = await ctx.get(`/api/reports/os?${wideRange()}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.faturamento).toBeNull();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    for (const row of body.data) {
      expect(row.totalAmount).toBeNull();
      expect(row.total).toBeNull();
      expect(row.paymentMethod).toBeNull();
      expect(row.paymentMethodLegacy).toBeNull();
      // Non-financial fields must still be present - the fix must not hide
      // the whole report, only the money fields.
      expect(typeof row.code).toBe("string");
      expect(typeof row.status).toBe("string");
    }
    await ctx.dispose();
  });

  test("usuario com 'reports'+'finance' (operador) continua recebendo faturamento e valores por OS normalmente", async () => {
    const ctx = await request.newContext({ storageState: "tests/.auth/operador.json", baseURL: BASE_URL });
    const res = await ctx.get(`/api/reports/os?${wideRange()}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.faturamento).toBe("number");
    const populated = body.data.find((row: { totalAmount: number | null }) => row.totalAmount !== null);
    expect(populated).toBeTruthy();
    await ctx.dispose();
  });

  test("admin global continua recebendo faturamento e valores por OS normalmente", async () => {
    const ctx = await request.newContext({ storageState: "tests/.auth/admin.json", baseURL: BASE_URL });
    const res = await ctx.get(`/api/reports/os?${wideRange()}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.faturamento).toBe("number");
    await ctx.dispose();
  });
});

test.describe("SECURITY-AUDIT F2 - funcionario/servico desativado nao pode ser reanexado", () => {
  let branchAId: string;
  let clientId: string;
  let activeServiceId: string;
  let deletedServiceId: string;
  let deletedEmployeeId: string;
  let testOrderId: string;
  let testAppointmentId: string;

  test.beforeAll(async () => {
    const branchA = await prisma.branch.findUniqueOrThrow({ where: { name: "Filial Teste Norte" } });
    branchAId = branchA.id;
    const client = await prisma.client.findFirstOrThrow({ where: { branchId: branchAId, email: "joao.silva@teste.local" } });
    clientId = client.id;
    const activeService = await prisma.service.findFirstOrThrow({ where: { branchId: branchAId, deletedAt: null } });
    activeServiceId = activeService.id;

    // Fixtures created disposable for this spec, then immediately soft-deleted -
    // never touches any shared seed fixture (employeeA1/A2, servicoA1/A2/A3)
    // that other specs depend on.
    const disposableService = await prisma.service.create({
      data: { branchId: branchAId, name: "F2 Servico Desativado (teste)", price: 10, durationHours: 1, category: "Teste", active: false },
    });
    deletedServiceId = disposableService.id;
    await prisma.service.update({ where: { id: deletedServiceId }, data: { deletedAt: new Date() } });

    const disposableEmployee = await prisma.employee.create({
      data: { branchId: branchAId, name: "F2 Funcionario Desativado (teste)", role: "Teste", dailyRate: 0, paymentType: "diaria" },
    });
    deletedEmployeeId = disposableEmployee.id;
    await prisma.employee.update({ where: { id: deletedEmployeeId }, data: { deletedAt: new Date() } });

    // One live, perfectly normal order/appointment (active service only) to
    // exercise the PUT /api/orders/[id], POST/PUT /api/appointments paths.
    const ctx = await request.newContext({ storageState: "tests/.auth/operador.json", baseURL: BASE_URL });
    const now = new Date();
    const res = await ctx.post("/api/orders", {
      data: {
        clientId,
        eventDate: now.toISOString(),
        startTime: "09:00",
        endTime: "10:00",
        status: "agendado",
        items: [{ serviceId: activeServiceId, quantity: 1, unitPrice: 10 }],
        employeeIds: [],
      },
    });
    expect(res.status()).toBe(201);
    const order = await res.json();
    testOrderId = order.id;
    testAppointmentId = order.appointments[0].id;
    await ctx.dispose();
  });

  test.afterAll(async () => {
    // Hard-delete the disposable fixtures this spec created (never a
    // soft-delete-only cleanup - these rows must not linger in the shared
    // local test DB for other specs/runs to trip over).
    await prisma.appointment.deleteMany({ where: { orderId: testOrderId } });
    await prisma.serviceOrderItem.deleteMany({ where: { orderId: testOrderId } });
    await prisma.serviceOrder.delete({ where: { id: testOrderId } }).catch(() => {});
    await prisma.service.delete({ where: { id: deletedServiceId } }).catch(() => {});
    await prisma.employee.delete({ where: { id: deletedEmployeeId } }).catch(() => {});
    await prisma.$disconnect();
  });

  test("POST /api/orders rejeita um servico desativado com 422", async () => {
    const ctx = await request.newContext({ storageState: "tests/.auth/operador.json", baseURL: BASE_URL });
    const res = await ctx.post("/api/orders", {
      data: {
        clientId,
        eventDate: new Date().toISOString(),
        startTime: "09:00",
        endTime: "10:00",
        status: "agendado",
        items: [{ serviceId: deletedServiceId, quantity: 1, unitPrice: 10 }],
        employeeIds: [],
      },
    });
    expect(res.status()).toBe(422);
    await ctx.dispose();
  });

  test("POST /api/orders rejeita um funcionario desativado com 422", async () => {
    const ctx = await request.newContext({ storageState: "tests/.auth/operador.json", baseURL: BASE_URL });
    const res = await ctx.post("/api/orders", {
      data: {
        clientId,
        eventDate: new Date().toISOString(),
        startTime: "09:00",
        endTime: "10:00",
        status: "agendado",
        items: [{ serviceId: activeServiceId, quantity: 1, unitPrice: 10 }],
        employeeIds: [deletedEmployeeId],
      },
    });
    expect(res.status()).toBe(422);
    await ctx.dispose();
  });

  test("PUT /api/orders/[id] rejeita um servico desativado com 422", async () => {
    const ctx = await request.newContext({ storageState: "tests/.auth/operador.json", baseURL: BASE_URL });
    const res = await ctx.put(`/api/orders/${testOrderId}`, {
      data: {
        clientId,
        eventDate: new Date().toISOString(),
        startTime: "09:00",
        endTime: "10:00",
        status: "agendado",
        items: [{ serviceId: deletedServiceId, quantity: 1, unitPrice: 10 }],
        employeeIds: [],
      },
    });
    expect(res.status()).toBe(422);
    await ctx.dispose();
  });

  test("POST /api/appointments rejeita um funcionario desativado com 422", async () => {
    const ctx = await request.newContext({ storageState: "tests/.auth/operador.json", baseURL: BASE_URL });
    const res = await ctx.post("/api/appointments", {
      data: { orderId: testOrderId, employeeId: deletedEmployeeId, dates: [new Date().toISOString()], startTime: "11:00", endTime: "12:00" },
    });
    expect(res.status()).toBe(422);
    await ctx.dispose();
  });

  test("PUT /api/appointments/[id] rejeita um funcionario desativado com 422", async () => {
    const ctx = await request.newContext({ storageState: "tests/.auth/operador.json", baseURL: BASE_URL });
    const res = await ctx.put(`/api/appointments/${testAppointmentId}`, { data: { employeeId: deletedEmployeeId } });
    expect(res.status()).toBe(422);
    await ctx.dispose();
  });

  test("POST /api/recurring-schedules rejeita servico e funcionario desativados com 422", async () => {
    const ctx = await request.newContext({ storageState: "tests/.auth/operador.json", baseURL: BASE_URL });
    const now = new Date();
    const resService = await ctx.post("/api/recurring-schedules", {
      data: {
        clientId, serviceId: deletedServiceId, frequency: "weekly", daysOfWeek: [now.getDay()],
        startTime: "09:00", endTime: "10:00", price: 10, startDate: now.toISOString(), employeeIds: [],
      },
    });
    expect(resService.status()).toBe(422);

    const resEmployee = await ctx.post("/api/recurring-schedules", {
      data: {
        clientId, serviceId: activeServiceId, frequency: "weekly", daysOfWeek: [now.getDay()],
        startTime: "09:00", endTime: "10:00", price: 10, startDate: now.toISOString(), employeeIds: [deletedEmployeeId],
      },
    });
    expect(resEmployee.status()).toBe(422);
    await ctx.dispose();
  });

  // F6 reuses this describe block's already-deactivated employee fixture -
  // kept here (not a separate top-level describe) specifically so it shares
  // the same beforeAll/afterAll lifecycle and never needs its own disposable
  // employee.
  test("SECURITY-AUDIT F6: GET /api/reports/employees/[id] continua acessivel para um funcionario desativado, e marca active:false", async () => {
    const ctx = await request.newContext({ storageState: "tests/.auth/operador.json", baseURL: BASE_URL });
    const res = await ctx.get(`/api/reports/employees/${deletedEmployeeId}?${wideRange()}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.employee.active).toBe(false);
    expect(body.employee.id).toBe(deletedEmployeeId);
    await ctx.dispose();
  });

  test("SECURITY-AUDIT F6: funcionario desativado nao aparece na listagem de funcionarios ativos (regressao)", async () => {
    const ctx = await request.newContext({ storageState: "tests/.auth/operador.json", baseURL: BASE_URL });
    const res = await ctx.get(`/api/employees`);
    expect(res.status()).toBe(200);
    const list = await res.json();
    expect(list.some((e: { id: string }) => e.id === deletedEmployeeId)).toBe(false);
    await ctx.dispose();
  });
});

test.describe("SECURITY-AUDIT F3 - relatorios nao vazam OS excluida (soft-delete)", () => {
  let branchAId: string;
  let clientId: string;
  let serviceId: string;
  let orderCode: string;
  let orderId: string;
  let appointmentId: string;
  let appointmentDateStr: string;

  test.beforeAll(async () => {
    const branchA = await prisma.branch.findUniqueOrThrow({ where: { name: "Filial Teste Norte" } });
    branchAId = branchA.id;
    const client = await prisma.client.findFirstOrThrow({ where: { branchId: branchAId, email: "joao.silva@teste.local" } });
    clientId = client.id;
    const service = await prisma.service.findFirstOrThrow({ where: { branchId: branchAId, deletedAt: null } });
    serviceId = service.id;

    const ctx = await request.newContext({ storageState: "tests/.auth/operador.json", baseURL: BASE_URL });
    const now = new Date();
    appointmentDateStr = now.toISOString().slice(0, 10);
    const res = await ctx.post("/api/orders", {
      data: {
        clientId,
        eventDate: now.toISOString(),
        startTime: "09:00",
        endTime: "10:00",
        status: "agendado",
        items: [{ serviceId, quantity: 1, unitPrice: 10 }],
        employeeIds: [],
      },
    });
    expect(res.status()).toBe(201);
    const order = await res.json();
    orderId = order.id;
    orderCode = order.code;
    appointmentId = order.appointments[0].id;

    // Cancel the appointment first (so it also qualifies for the
    // reports/cancellations check), THEN soft-delete the whole order - this
    // reproduces exactly the F3 precondition (an order deleted after one of
    // its appointments was already cancelled/had activity).
    const cancelRes = await ctx.post(`/api/appointments/${appointmentId}/cancel`, { data: { reason: "F3 fixture cleanup (teste)" } });
    expect(cancelRes.status()).toBe(200);
    const deleteRes = await ctx.delete(`/api/orders/${orderId}`);
    expect(deleteRes.status()).toBe(200);
    await ctx.dispose();
  });

  test.afterAll(async () => {
    await prisma.appointment.deleteMany({ where: { orderId } });
    await prisma.serviceOrderItem.deleteMany({ where: { orderId } });
    await prisma.serviceOrder.delete({ where: { id: orderId } }).catch(() => {});
    await prisma.$disconnect();
  });

  test("GET /api/reports/appointments nao inclui o atendimento de uma OS excluida", async () => {
    const ctx = await request.newContext({ storageState: "tests/.auth/operador.json", baseURL: BASE_URL });
    const res = await ctx.get(`/api/reports/appointments?period=personalizado&from=${appointmentDateStr}&to=${appointmentDateStr}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.some((row: { order: { code: string } }) => row.order.code === orderCode)).toBe(false);
    await ctx.dispose();
  });

  test("GET /api/reports/cancellations nao inclui o cancelamento de uma OS excluida", async () => {
    const ctx = await request.newContext({ storageState: "tests/.auth/operador.json", baseURL: BASE_URL });
    const res = await ctx.get(`/api/reports/cancellations?period=personalizado&from=${appointmentDateStr}&to=${appointmentDateStr}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.some((row: { orderCode: string }) => row.orderCode === orderCode)).toBe(false);
    await ctx.dispose();
  });

  test("GET /api/reports/services nao inclui o item de servico de uma OS excluida", async () => {
    const ctx = await request.newContext({ storageState: "tests/.auth/operador.json", baseURL: BASE_URL });
    const res = await ctx.get(`/api/reports/services?period=personalizado&from=${appointmentDateStr}&to=${appointmentDateStr}&serviceId=${serviceId}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.some((row: { order: { code: string } }) => row.order.code === orderCode)).toBe(false);
    await ctx.dispose();
  });
});

test.describe("SECURITY-AUDIT F4 - cancelamento de atendimento e terminal", () => {
  let branchAId: string;
  let clientId: string;
  let serviceId: string;
  let orderId: string;
  let appointmentId: string;

  test.beforeAll(async () => {
    const branchA = await prisma.branch.findUniqueOrThrow({ where: { name: "Filial Teste Norte" } });
    branchAId = branchA.id;
    const client = await prisma.client.findFirstOrThrow({ where: { branchId: branchAId, email: "joao.silva@teste.local" } });
    clientId = client.id;
    const service = await prisma.service.findFirstOrThrow({ where: { branchId: branchAId, deletedAt: null } });
    serviceId = service.id;

    const ctx = await request.newContext({ storageState: "tests/.auth/operador.json", baseURL: BASE_URL });
    const res = await ctx.post("/api/orders", {
      data: {
        clientId, eventDate: new Date().toISOString(), startTime: "09:00", endTime: "10:00", status: "agendado",
        items: [{ serviceId, quantity: 1, unitPrice: 10 }], employeeIds: [],
      },
    });
    expect(res.status()).toBe(201);
    const order = await res.json();
    orderId = order.id;
    appointmentId = order.appointments[0].id;

    const cancelRes = await ctx.post(`/api/appointments/${appointmentId}/cancel`, { data: { reason: "F4 fixture (teste)" } });
    expect(cancelRes.status()).toBe(200);
    await ctx.dispose();
  });

  test.afterAll(async () => {
    await prisma.appointment.deleteMany({ where: { orderId } });
    await prisma.serviceOrderItem.deleteMany({ where: { orderId } });
    await prisma.serviceOrder.delete({ where: { id: orderId } }).catch(() => {});
    await prisma.$disconnect();
  });

  test("POST /api/appointments/[id]/complete rejeita um atendimento cancelado com 422, e nao marca completedAt", async () => {
    const ctx = await request.newContext({ storageState: "tests/.auth/operador.json", baseURL: BASE_URL });
    const res = await ctx.post(`/api/appointments/${appointmentId}/complete`);
    expect(res.status()).toBe(422);
    await ctx.dispose();

    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    expect(row.status).not.toBe("realizado");
    expect(row.completedAt).toBeNull();
    // Nenhum e-mail de conclusao pode ter sido disparado - o fluxo de envio
    // só é alcançado DEPOIS da transação de conclusão, que nunca roda aqui.
  });

  test("PUT /api/appointments/[id] com status:'realizado' rejeita um atendimento cancelado com 422", async () => {
    const ctx = await request.newContext({ storageState: "tests/.auth/operador.json", baseURL: BASE_URL });
    const res = await ctx.put(`/api/appointments/${appointmentId}`, { data: { status: "realizado" } });
    expect(res.status()).toBe(422);
    await ctx.dispose();

    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    expect(row.status).not.toBe("realizado");
  });

  test("PUT /api/appointments/[id] continua rejeitando reagendamento de um atendimento cancelado (regressao)", async () => {
    const ctx = await request.newContext({ storageState: "tests/.auth/operador.json", baseURL: BASE_URL });
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const res = await ctx.put(`/api/appointments/${appointmentId}`, { data: { date: tomorrow.toISOString() } });
    expect(res.status()).toBe(422);
    await ctx.dispose();
  });
});

test.describe("SECURITY-AUDIT F5 - cancelar 1 atendimento realizado nao reverte a receita da OS", () => {
  let branchAId: string;
  let clientId: string;
  let serviceId: string;
  let orderId: string;
  let appointmentId: string;
  let orderTotalAmount: number;

  test.beforeAll(async () => {
    const branchA = await prisma.branch.findUniqueOrThrow({ where: { name: "Filial Teste Norte" } });
    branchAId = branchA.id;
    const client = await prisma.client.findFirstOrThrow({ where: { branchId: branchAId, email: "joao.silva@teste.local" } });
    clientId = client.id;
    const service = await prisma.service.findFirstOrThrow({ where: { branchId: branchAId, deletedAt: null } });
    serviceId = service.id;

    const ctx = await request.newContext({ storageState: "tests/.auth/operador.json", baseURL: BASE_URL });
    // Single-appointment order: completing its only appointment finalizes
    // (and bills) the whole OS - the exact precondition the approved F5 rule
    // is about ("a OS tenha sido efetivamente executada e faturada").
    const res = await ctx.post("/api/orders", {
      data: {
        clientId, eventDate: new Date().toISOString(), startTime: "09:00", endTime: "10:00", status: "agendado",
        items: [{ serviceId, quantity: 1, unitPrice: 199.9 }], employeeIds: [],
      },
    });
    expect(res.status()).toBe(201);
    const order = await res.json();
    orderId = order.id;
    appointmentId = order.appointments[0].id;
    // order.totalAmount comes back from the API as a string (Prisma Decimal
    // serialization via lib/json.ts's serialize()) - must be coerced before
    // any numeric assertion against it.
    orderTotalAmount = Number(order.totalAmount);

    const completeRes = await ctx.post(`/api/appointments/${appointmentId}/complete`);
    expect(completeRes.status()).toBe(200);
    await ctx.dispose();

    const billedOrder = await prisma.serviceOrder.findUniqueOrThrow({ where: { id: orderId } });
    expect(billedOrder.status).toBe("realizado");
    const billedTx = await prisma.transaction.findFirst({ where: { orderId, isAutoRevenue: true } });
    expect(billedTx).not.toBeNull();
    expect(billedTx!.status).toBe("pago");
  });

  test.afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { orderId } });
    await prisma.appointment.deleteMany({ where: { orderId } });
    await prisma.serviceOrderItem.deleteMany({ where: { orderId } });
    await prisma.serviceOrder.delete({ where: { id: orderId } }).catch(() => {});
    await prisma.$disconnect();
  });

  test("cancelar o unico atendimento (ja realizado) de uma OS ja faturada mantem a OS 'realizado' e a receita 'pago'", async () => {
    const ctx = await request.newContext({ storageState: "tests/.auth/operador.json", baseURL: BASE_URL });
    const res = await ctx.post(`/api/appointments/${appointmentId}/cancel`, { data: { reason: "F5 fixture (teste)" } });
    expect(res.status()).toBe(200);
    await ctx.dispose();

    const order = await prisma.serviceOrder.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("realizado");
    expect(order.cancelledAt).toBeNull();

    const tx = await prisma.transaction.findFirstOrThrow({ where: { orderId, isAutoRevenue: true } });
    expect(tx.status).toBe("pago");
    expect(tx.deletedAt).toBeNull();
    expect(Number(tx.amount)).toBeCloseTo(orderTotalAmount, 2);
  });

  test("cancelamento da OS inteira (regra separada, ja existente) continua revertendo a receita normalmente", async () => {
    // Confirms the WHOLE-order cancel route's own, unchanged, pre-existing
    // billing-reversal rule is untouched by the F5 decision above - the two
    // cancellation granularities (one appointment vs. the whole OS) are
    // deliberately different rules, per the approved business decision.
    const ctx = await request.newContext({ storageState: "tests/.auth/operador.json", baseURL: BASE_URL });
    const res = await ctx.post(`/api/orders/${orderId}/cancel`, { data: { reason: "F5 fixture cleanup (teste)" } });
    expect(res.status()).toBe(200);
    await ctx.dispose();

    const tx = await prisma.transaction.findFirst({ where: { orderId, isAutoRevenue: true } });
    expect(tx).not.toBeNull();
    expect(tx!.deletedAt).not.toBeNull();
  });
});
