import { test, expect, request } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../.env.test"), override: true });
const prisma = new PrismaClient();

// Every fixture here is created fresh per test (unique name/timestamp),
// never reusing/mutating the shared OS-TEST-* seed rows - same convention as
// clients-crud.spec.ts / transform-to-recurring.spec.ts.
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

type Fixture = { client: { id: string }; service: { id: string }; employee: { id: string }; order: { id: string; code: string; eventDate: string; startTime: string; endTime: string } };

async function createOrder(branchId: string, opts: { dates?: Date[]; storageState?: "admin" | "operador" } = {}): Promise<Fixture> {
  const storageState = opts.storageState ?? "operador";
  const ctx = await newContext(storageState);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const client = await ctx.post("/api/clients", { data: { branchId, name: `Cliente Reagendar ${suffix}`, addressStreet: "Rua de Teste", addressNumber: "10", addressNeighborhood: "Bairro Teste", addressCity: "Vitoria", addressState: "ES" } }).then((r) => r.json());
  const service = await ctx.post("/api/services", { data: { branchId, name: `Servico Reagendar ${suffix}`, price: 200, durationHours: 2, category: "Teste", active: true } }).then((r) => r.json());
  const employee = await ctx.post("/api/employees", { data: { branchId, name: `Funcionario Reagendar ${suffix}`, role: "Faxineira", dailyRate: 150 } }).then((r) => r.json());
  const [eventDate, ...extraDates] = opts.dates && opts.dates.length > 0 ? opts.dates : [utcDate(14)];
  const order = await ctx
    .post("/api/orders", {
      data: {
        branchId, clientId: client.id, eventDate: eventDate.toISOString(), startTime: "09:00", endTime: "11:00", status: "agendado",
        employeeIds: [employee.id], items: [{ serviceId: service.id, quantity: 1, unitPrice: 200 }],
        ...(extraDates.length ? { dates: [eventDate.toISOString(), ...extraDates.map((d) => d.toISOString())] } : {}),
      },
    })
    .then((r) => r.json());
  await ctx.dispose();
  return { client, service, employee, order };
}

async function getOrder(ctx: Awaited<ReturnType<typeof newContext>>, orderId: string) {
  return ctx.get(`/api/orders/${orderId}`).then((r) => r.json());
}

test.describe("Corrigir data/horario de um atendimento (PUT /api/appointments/:id)", () => {
  let branchAId: string;
  let branchBId: string;

  test.beforeAll(async () => {
    branchAId = (await prisma.branch.findUniqueOrThrow({ where: { name: "Filial Teste Norte" } })).id;
    branchBId = (await prisma.branch.findUniqueOrThrow({ where: { name: "Filial Teste Sul" } })).id;
  });

  test.afterAll(async () => prisma.$disconnect());

  test("OS Agendada com um unico atendimento: altera data/horario, status continua Agendado e a OS acompanha (ocorrencia principal)", async () => {
    const fx = await createOrder(branchAId, { dates: [utcDate(14)] });
    const ctx = await newContext();
    const before = await getOrder(ctx, fx.order.id);
    const apptId = before.appointments[0].id;
    const newDate = ymd(utcDate(19));

    const res = await ctx.put(`/api/appointments/${apptId}`, { data: { date: newDate, startTime: "10:00", endTime: "12:00" } });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.status).toBe("agendado"); // status never flips just because the date changed
    expect(body.date.slice(0, 10)).toBe(newDate);

    const after = await getOrder(ctx, fx.order.id);
    expect(after.status).toBe("agendado");
    expect(after.appointments).toHaveLength(1); // never duplicated
    expect(after.eventDate.slice(0, 10)).toBe(newDate); // OS-level fields follow the sole (=principal) occurrence
    expect(after.startTime).toBe("10:00");
    expect(after.endTime).toBe("12:00");

    await ctx.dispose();
  });

  test("OS Realizada com um unico atendimento: altera a data mesmo apos concluida, status continua Realizado, financeiro (receita automatica) permanece intacto", async () => {
    const fx = await createOrder(branchAId, { dates: [utcDate(20)] });
    const ctx = await newContext();
    const before = await getOrder(ctx, fx.order.id);
    const apptId = before.appointments[0].id;

    const completeRes = await ctx.post(`/api/appointments/${apptId}/complete`);
    expect(completeRes.ok()).toBe(true);

    const txBefore = await prisma.transaction.findFirstOrThrow({ where: { orderId: fx.order.id, isAutoRevenue: true } });

    const newDate = ymd(utcDate(21));
    const res = await ctx.put(`/api/appointments/${apptId}`, { data: { date: newDate, startTime: "14:00", endTime: "16:00" } });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.status).toBe("realizado"); // never bounced back to agendado

    const after = await getOrder(ctx, fx.order.id);
    expect(after.status).toBe("realizado");
    expect(after.eventDate.slice(0, 10)).toBe(newDate);

    // Never a duplicate/second auto-revenue transaction, never a changed amount.
    const txsAfter = await prisma.transaction.findMany({ where: { orderId: fx.order.id, isAutoRevenue: true, deletedAt: null } });
    expect(txsAfter).toHaveLength(1);
    expect(txsAfter[0].id).toBe(txBefore.id);
    expect(Number(txsAfter[0].amount)).toBe(Number(txBefore.amount));
    expect(txsAfter[0].dueDate.getTime()).toBe(txBefore.dueDate.getTime());
    expect(txsAfter[0].paidAt?.getTime()).toBe(txBefore.paidAt?.getTime());

    await ctx.dispose();
  });

  test("OS com multiplos atendimentos: reagendar um atendimento NAO-principal so muda ele mesmo - os demais e a data principal da OS ficam intactos", async () => {
    const d0 = utcDate(30), d1 = utcDate(32), d2 = utcDate(34);
    const fx = await createOrder(branchAId, { dates: [d0, d1, d2] });
    const ctx = await newContext();
    const before = await getOrder(ctx, fx.order.id);
    expect(before.appointments).toHaveLength(3);

    // appointments[0] is the principal one (date === order.eventDate).
    const principal = before.appointments.find((a: { date: string }) => a.date.slice(0, 10) === ymd(d0));
    const secondary = before.appointments.find((a: { date: string }) => a.date.slice(0, 10) === ymd(d1));
    const untouched = before.appointments.find((a: { date: string }) => a.date.slice(0, 10) === ymd(d2));
    await ctx.post(`/api/appointments/${principal.id}/complete`);
    await ctx.post(`/api/appointments/${secondary.id}/complete`);
    // untouched stays "agendado" - the OS as a whole must not auto-finalize.

    const newDate = ymd(utcDate(40));
    const res = await ctx.put(`/api/appointments/${secondary.id}`, { data: { date: newDate, startTime: "08:00", endTime: "09:00" } });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.status).toBe("realizado");

    const after = await getOrder(ctx, fx.order.id);
    expect(after.appointments).toHaveLength(3); // never duplicated
    expect(after.status).toBe("agendado"); // 3rd occurrence still open - OS never auto-finalizes
    expect(after.eventDate.slice(0, 10)).toBe(ymd(d0)); // OS-level date untouched: the edited occurrence was not the principal one
    const afterPrincipal = after.appointments.find((a: { id: string }) => a.id === principal.id);
    const afterSecondary = after.appointments.find((a: { id: string }) => a.id === secondary.id);
    const afterUntouched = after.appointments.find((a: { id: string }) => a.id === untouched.id);
    expect(afterPrincipal.date.slice(0, 10)).toBe(ymd(d0)); // sibling #1 intact
    expect(afterUntouched.date.slice(0, 10)).toBe(ymd(d2)); // sibling #2 intact
    expect(afterUntouched.status).toBe("agendado");
    expect(afterSecondary.date.slice(0, 10)).toBe(newDate); // only the edited one moved
    expect(afterSecondary.startTime).toBe("08:00");

    await ctx.dispose();
  });

  test("OS com multiplos atendimentos: reagendar o atendimento PRINCIPAL atualiza a data/hora da OS, sem tocar os demais", async () => {
    const d0 = utcDate(50), d1 = utcDate(52), d2 = utcDate(54);
    const fx = await createOrder(branchAId, { dates: [d0, d1, d2] });
    const ctx = await newContext();
    const before = await getOrder(ctx, fx.order.id);
    const principal = before.appointments.find((a: { date: string }) => a.date.slice(0, 10) === ymd(d0));

    const newDate = ymd(utcDate(60));
    const res = await ctx.put(`/api/appointments/${principal.id}`, { data: { date: newDate, startTime: "07:00", endTime: "08:30" } });
    expect(res.ok()).toBe(true);

    const after = await getOrder(ctx, fx.order.id);
    expect(after.appointments).toHaveLength(3);
    expect(after.eventDate.slice(0, 10)).toBe(newDate);
    expect(after.startTime).toBe("07:00");
    expect(after.endTime).toBe("08:30");
    const others = after.appointments.filter((a: { id: string }) => a.id !== principal.id).map((a: { date: string }) => a.date.slice(0, 10));
    expect(new Set(others)).toEqual(new Set([ymd(d1), ymd(d2)])); // siblings never move

    await ctx.dispose();
  });

  test("Auditoria: registra quem alterou, status no momento, e a data/horario antigo e novo - so quando a data/horario realmente muda", async () => {
    const fx = await createOrder(branchAId, { dates: [utcDate(70)] });
    const ctx = await newContext();
    const before = await getOrder(ctx, fx.order.id);
    const apptId = before.appointments[0].id;
    await ctx.post(`/api/appointments/${apptId}/complete`);

    const oldDate = ymd(utcDate(70));
    const newDate = ymd(utcDate(75));
    await ctx.put(`/api/appointments/${apptId}`, { data: { date: newDate, startTime: "13:00", endTime: "15:00" } });

    const logs = await prisma.appointmentRescheduleLog.findMany({ where: { appointmentId: apptId } });
    expect(logs).toHaveLength(1);
    expect(logs[0].statusAtChange).toBe("realizado");
    expect(logs[0].previousDate.toISOString().slice(0, 10)).toBe(oldDate);
    expect(logs[0].newDate.toISOString().slice(0, 10)).toBe(newDate);
    expect(logs[0].previousStartTime).toBe("09:00");
    expect(logs[0].newStartTime).toBe("13:00");
    expect(logs[0].changedBy).toBeTruthy();

    // A plain, non-date field update (assigning a different employee) must
    // NOT create a reschedule-audit row - the log is scoped to date/time
    // corrections only, never a general-purpose appointment audit trail.
    const employee2 = await ctx.post("/api/employees", { data: { branchId: branchAId, name: `Funcionario Audit ${Date.now()}`, role: "Faxineira", dailyRate: 100 } }).then((r) => r.json());
    await ctx.put(`/api/appointments/${apptId}`, { data: { employeeId: employee2.id } });
    const logsAfter = await prisma.appointmentRescheduleLog.findMany({ where: { appointmentId: apptId } });
    expect(logsAfter).toHaveLength(1); // still just the one from the actual reschedule

    await ctx.dispose();
  });

  test("Recorrencia: reagendar uma ocorrencia isolada preserva as demais e a regra da recorrencia; colidir com outra ocorrencia da MESMA recorrencia e rejeitado", async () => {
    const monday = utcDate((8 - utcDate(14).getUTCDay()) % 7 + 14); // a Monday at least 14 days out
    const fx = await createOrder(branchAId, { dates: [monday] });
    const ctx = await newContext();

    const endDate = new Date(monday);
    endDate.setUTCDate(endDate.getUTCDate() + 21);
    const transformRes = await ctx.post(`/api/orders/${fx.order.id}/transform-to-recurring`, {
      data: {
        clientId: fx.client.id, serviceId: fx.service.id, frequency: "weekly", interval: 1,
        daysOfWeek: [monday.getUTCDay(), (monday.getUTCDay() + 2) % 7], // Mon + Wed
        startTime: "09:00", endTime: "11:00", price: 200,
        startDate: ymd(monday), endDate: ymd(endDate), employeeIds: [fx.employee.id],
      },
    });
    expect(transformRes.ok()).toBe(true);
    const schedule = await prisma.recurringSchedule.findFirstOrThrow({ where: { orderId: fx.order.id } });
    const occurrences = await prisma.appointment.findMany({ where: { recurringScheduleId: schedule.id }, orderBy: { date: "asc" } });
    expect(occurrences.length).toBeGreaterThanOrEqual(3);

    // Move the 2nd occurrence to an off-pattern date (a Saturday, never
    // generated by this Mon+Wed schedule) - must succeed and touch nothing else.
    const moved = occurrences[1];
    const offPatternDate = ymd(utcDate(200));
    const moveRes = await ctx.put(`/api/appointments/${moved.id}`, { data: { date: offPatternDate } });
    expect(moveRes.ok()).toBe(true);

    const scheduleAfter = await prisma.recurringSchedule.findUniqueOrThrow({ where: { id: schedule.id } });
    expect(scheduleAfter.frequency).toBe(schedule.frequency);
    expect(scheduleAfter.daysOfWeek).toEqual(schedule.daysOfWeek);
    expect(Number(scheduleAfter.price)).toBe(Number(schedule.price));
    const siblingsAfterMove = await prisma.appointment.findMany({ where: { recurringScheduleId: schedule.id } });
    expect(siblingsAfterMove).toHaveLength(occurrences.length); // no new row, none lost
    const other = siblingsAfterMove.find((a) => a.id === occurrences[0].id)!;
    expect(other.date.toISOString().slice(0, 10)).toBe(occurrences[0].date.toISOString().slice(0, 10)); // sibling untouched

    // Now try to collide occurrence[2] onto occurrence[0]'s (unmoved) date -
    // reuses the pre-existing @@unique([recurringScheduleId, date]) rule.
    const collideRes = await ctx.put(`/api/appointments/${occurrences[2].id}`, { data: { date: occurrences[0].date.toISOString().slice(0, 10) } });
    expect(collideRes.status()).toBe(422);
    const collideBody = await collideRes.json();
    expect(collideBody.message).toMatch(/recorrencia/i);
    const stillThere = await prisma.appointment.findUniqueOrThrow({ where: { id: occurrences[2].id } });
    expect(stillThere.date.toISOString().slice(0, 10)).toBe(occurrences[2].date.toISOString().slice(0, 10)); // rejected, unchanged

    await ctx.dispose();
  });

  test("Atendimento cancelado nao pode ter a data alterada", async () => {
    const fx = await createOrder(branchAId, { dates: [utcDate(80)] });
    const ctx = await newContext();
    const before = await getOrder(ctx, fx.order.id);
    const apptId = before.appointments[0].id;
    await ctx.post(`/api/appointments/${apptId}/cancel`, { data: { reason: "Teste E2E de cancelamento" } });

    const res = await ctx.put(`/api/appointments/${apptId}`, { data: { date: ymd(utcDate(85)) } });
    expect(res.status()).toBe(422);
    const body = await res.json();
    expect(body.message).toMatch(/cancelado/i);

    const stillThere = await prisma.appointment.findUniqueOrThrow({ where: { id: apptId } });
    expect(stillThere.date.toISOString().slice(0, 10)).toBe(ymd(utcDate(80)));

    await ctx.dispose();
  });

  test("Validacao: data invalida retorna mensagem especifica e o campo 'date'", async () => {
    const fx = await createOrder(branchAId, { dates: [utcDate(90)] });
    const ctx = await newContext();
    const before = await getOrder(ctx, fx.order.id);
    const apptId = before.appointments[0].id;

    const res = await ctx.put(`/api/appointments/${apptId}`, { data: { date: "nao-e-uma-data" } });
    expect(res.status()).toBe(422);
    const body = await res.json();
    expect(body.field).toBe("date");
    expect(body.message).toMatch(/data valida/i);

    await ctx.dispose();
  });

  test("Atendimento inexistente retorna 404", async () => {
    const ctx = await newContext();
    const res = await ctx.put("/api/appointments/00000000-0000-0000-0000-000000000000", { data: { date: ymd(utcDate(95)) } });
    expect(res.status()).toBe(404);
    await ctx.dispose();
  });

  test("IDOR: operador (so tem acesso a Filial Teste Norte) recebe 404 ao tentar reagendar um atendimento de outra filial", async () => {
    const fx = await createOrder(branchBId, { dates: [utcDate(100)], storageState: "admin" });
    const adminCtx = await newContext("admin");
    const before = await getOrder(adminCtx, fx.order.id);
    const apptId = before.appointments[0].id;
    await adminCtx.dispose();

    const ctx = await newContext("operador");
    const res = await ctx.put(`/api/appointments/${apptId}`, { data: { date: ymd(utcDate(105)) } });
    expect(res.status()).toBe(404);

    const stillThere = await prisma.appointment.findUniqueOrThrow({ where: { id: apptId } });
    expect(stillThere.date.toISOString().slice(0, 10)).toBe(ymd(utcDate(100))); // confirms the 404 is real branch isolation, not a mutation that happened anyway

    await ctx.dispose();
  });

  test("Relatorios: a OS/atendimento some do periodo antigo e passa a aparecer no periodo novo, sem duplicar, apos a correcao", async () => {
    const oldDate = utcDate(110);
    const newDate = utcDate(140); // far enough that a same-day custom period never overlaps
    const fx = await createOrder(branchAId, { dates: [oldDate] });
    const ctx = await newContext();
    const before = await getOrder(ctx, fx.order.id);
    const apptId = before.appointments[0].id;

    const oldPeriodBefore = await ctx.get(`/api/reports/appointments?period=personalizado&from=${ymd(oldDate)}&to=${ymd(oldDate)}`).then((r) => r.json());
    expect(oldPeriodBefore.data.some((a: { id: string }) => a.id === apptId)).toBe(true);

    await ctx.put(`/api/appointments/${apptId}`, { data: { date: ymd(newDate) } });

    const oldPeriodAfter = await ctx.get(`/api/reports/appointments?period=personalizado&from=${ymd(oldDate)}&to=${ymd(oldDate)}`).then((r) => r.json());
    expect(oldPeriodAfter.data.some((a: { id: string }) => a.id === apptId)).toBe(false); // gone from the old period

    const newPeriodAfter = await ctx.get(`/api/reports/appointments?period=personalizado&from=${ymd(newDate)}&to=${ymd(newDate)}`).then((r) => r.json());
    const matches = newPeriodAfter.data.filter((a: { id: string }) => a.id === apptId);
    expect(matches).toHaveLength(1); // present exactly once in the new period, never duplicated

    await ctx.dispose();
  });
});

// Regression coverage for the actual bug report: editing the top-level
// "Data"/"Inicio"/"Fim" fields on the OS edit form (PUT /api/orders/:id) used
// to update ONLY service_orders.event_date/start_time/end_time - the linked
// Appointment row (Calendario/Relatorios/PDF/e-mail/WhatsApp's real source of
// truth) never moved, so nothing outside the OS list itself ever reflected
// the change. Fixed by syncing the OS's principal occurrence in the same
// transaction, mirroring PUT /api/appointments/[id]'s own sync in reverse.
test.describe("Editar a Data/Horario pelo formulario da OS (PUT /api/orders/:id) tambem move o atendimento", () => {
  let branchAId: string;

  test.beforeAll(async () => {
    branchAId = (await prisma.branch.findUniqueOrThrow({ where: { name: "Filial Teste Norte" } })).id;
  });

  test.afterAll(async () => prisma.$disconnect());

  function orderEditPayload(fx: Fixture, overrides: Record<string, unknown>) {
    return { clientId: fx.client.id, eventDate: fx.order.eventDate, startTime: fx.order.startTime, endTime: fx.order.endTime, status: "agendado", employeeIds: [fx.employee.id], items: [{ serviceId: fx.service.id, quantity: 1, unitPrice: 200 }], ...overrides };
  }

  test("OS avulsa: editar a Data no formulario da OS move o unico atendimento junto - nao fica so no nivel da OS", async () => {
    const oldDate = utcDate(150);
    const fx = await createOrder(branchAId, { dates: [oldDate] });
    const ctx = await newContext();
    const newDate = ymd(utcDate(155));

    const res = await ctx.put(`/api/orders/${fx.order.id}`, { data: orderEditPayload(fx, { eventDate: newDate, startTime: "13:00", endTime: "15:00" }) });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.eventDate.slice(0, 10)).toBe(newDate);
    expect(body.appointments).toHaveLength(1); // never duplicated
    expect(body.appointments[0].date.slice(0, 10)).toBe(newDate); // the actual bug: this used to stay at oldDate
    expect(body.appointments[0].startTime).toBe("13:00");
    expect(body.appointments[0].endTime).toBe("15:00");

    // Reflected in the Calendario's own query too (Appointment.date, branch+range) - not just the OS response.
    const calendar = await ctx.get(`/api/calendar?branchId=${branchAId}&from=${newDate}&to=${newDate}`).then((r) => r.json());
    expect(calendar.some((a: { orderId: string }) => a.orderId === fx.order.id)).toBe(true);

    await ctx.dispose();
  });

  test("OS com multiplos atendimentos: editar a Data da OS move so o atendimento PRINCIPAL (o que estava na data antiga da OS) - os demais ficam intactos", async () => {
    const d0 = utcDate(160), d1 = utcDate(162), d2 = utcDate(164);
    const fx = await createOrder(branchAId, { dates: [d0, d1, d2] });
    const ctx = await newContext();
    const newDate = ymd(utcDate(170));

    const res = await ctx.put(`/api/orders/${fx.order.id}`, { data: orderEditPayload(fx, { eventDate: newDate }) });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.appointments).toHaveLength(3); // never duplicated

    const principal = body.appointments.find((a: { date: string }) => a.date.slice(0, 10) === newDate);
    expect(principal).toBeTruthy();
    const others = body.appointments.filter((a: { id: string }) => a.id !== principal.id).map((a: { date: string }) => a.date.slice(0, 10));
    expect(new Set(others)).toEqual(new Set([ymd(d1), ymd(d2)])); // siblings never move

    await ctx.dispose();
  });

  test("Mudar status E data no mesmo salvamento da OS: os dois se aplicam ao atendimento principal, com um unico registro de auditoria", async () => {
    const oldDate = utcDate(180);
    const fx = await createOrder(branchAId, { dates: [oldDate] });
    const ctx = await newContext();
    const before = await getOrder(ctx, fx.order.id);
    const apptId = before.appointments[0].id;
    const newDate = ymd(utcDate(185));

    const res = await ctx.put(`/api/orders/${fx.order.id}`, { data: orderEditPayload(fx, { eventDate: newDate, status: "realizado" }) });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.status).toBe("realizado");
    expect(body.appointments[0].date.slice(0, 10)).toBe(newDate);
    expect(body.appointments[0].status).toBe("realizado");

    const logs = await prisma.appointmentRescheduleLog.findMany({ where: { appointmentId: apptId } });
    expect(logs).toHaveLength(1); // one write, not two separate updates racing each other
    expect(logs[0].newDate.toISOString().slice(0, 10)).toBe(newDate);

    await ctx.dispose();
  });
});
