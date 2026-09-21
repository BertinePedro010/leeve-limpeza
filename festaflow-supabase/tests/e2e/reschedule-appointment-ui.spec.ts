import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import path from "node:path";
import dotenv from "dotenv";
import { clickNav } from "./helpers";

dotenv.config({ path: path.resolve(__dirname, "../../.env.test"), override: true });
const prisma = new PrismaClient();

test.use({ storageState: "tests/.auth/operador.json" });

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function ptBrLabel(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

// Real-browser click path for correcting the date of an already-"realizado"
// atendimento (the API-level correctness checks - status preservation,
// financeiro, recorrencia, IDOR, auditoria - live in
// reschedule-appointment.spec.ts). This is the one test that actually drives
// the button + inline editor + confirm() dialog the way a real user would,
// proving the frontend's previous `disabled={isFinal}` block on the
// "reagendar" trigger (components/SaasApp.tsx AppointmentRow) is really gone.
test.describe("Corrigir data de um atendimento Realizado - fluxo real no navegador", () => {
  test.afterAll(async () => prisma.$disconnect());

  test("abrir a OS, reagendar o atendimento ja Realizado, confirmar o aviso e ver a nova data refletida", async ({ page }) => {
    const branchA = await prisma.branch.findUniqueOrThrow({ where: { name: "Filial Teste Norte" } });
    const suffix = `${Date.now()}`;
    const client = await prisma.client.create({ data: { branchId: branchA.id, name: `Cliente UI Reagendar ${suffix}`, addressStreet: "Rua UI", addressNumber: "1", addressNeighborhood: "Bairro", addressCity: "Vitoria", addressState: "ES" } });
    const service = await prisma.service.create({ data: { branchId: branchA.id, name: `Servico UI Reagendar ${suffix}`, price: 180, durationHours: 2, category: "Teste", active: true } });
    const oldDate = new Date();
    oldDate.setUTCDate(oldDate.getUTCDate() + 14);
    const oldDateUtc = new Date(Date.UTC(oldDate.getUTCFullYear(), oldDate.getUTCMonth(), oldDate.getUTCDate()));
    const newDateUtc = new Date(oldDateUtc);
    newDateUtc.setUTCDate(newDateUtc.getUTCDate() + 3);

    const order = await prisma.serviceOrder.create({
      data: {
        branchId: branchA.id, code: `OS-UIRESCH-${suffix}`, clientId: client.id,
        eventDate: oldDateUtc, startTime: "09:00", endTime: "11:00",
        location: "Rua UI, 1 - Vitoria - ES", addressStreet: "Rua UI", addressNumber: "1", addressNeighborhood: "Bairro", addressCity: "Vitoria", addressState: "ES",
        status: "realizado", totalAmount: 180,
        items: { create: [{ serviceId: service.id, quantity: 1, unitPrice: 180 }] },
      },
    });
    await prisma.appointment.create({ data: { orderId: order.id, branchId: branchA.id, date: oldDateUtc, startTime: "09:00", endTime: "11:00", status: "realizado", completedAt: new Date() } });

    // Accepts the "Este atendimento ja foi realizado..." confirm() dialog.
    page.on("dialog", (dialog) => dialog.accept());

    await page.goto("/app");
    await clickNav(page, "Ordens de Servico");
    await expect(page.getByRole("heading", { name: "Ordens de Servico", level: 2 })).toBeVisible();

    const row = page.locator("tr", { hasText: order.code });
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.getByRole("button", { name: "Editar" }).click();

    await expect(page.getByRole("heading", { name: `Editar OS ${order.code}` })).toBeVisible();
    const section = page.getByRole("heading", { name: /Atendimentos \/ Datas/ }).locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]");
    // Scoped to the Badge <span> specifically - "Realizado" also appears as
    // an <option> in this same row's status <select>, which would otherwise
    // make getByText ambiguous (Playwright strict mode).
    const statusBadge = section.locator("span", { hasText: "Realizado" });
    await expect(statusBadge).toBeVisible();

    // Before the fix, this trigger was disabled for a "realizado" occurrence
    // (disabled={isFinal}) - clicking it is the actual regression check.
    const trigger = section.getByRole("button", { name: new RegExp(`${ptBrLabel(oldDateUtc)}.*\\(reagendar\\)`) });
    await expect(trigger).toBeEnabled();
    await trigger.click();

    await section.locator('input[type="date"]').fill(ymd(newDateUtc));
    await section.getByRole("button", { name: "Salvar" }).click();

    await expect(page.getByText("Data do atendimento alterada com sucesso.")).toBeVisible({ timeout: 10000 });
    // Status stays "Realizado" - correcting the date never bounces it back to Agendado.
    await expect(statusBadge).toBeVisible();
    await expect(section.getByText(ptBrLabel(newDateUtc))).toBeVisible();

    const updated = await prisma.appointment.findFirstOrThrow({ where: { orderId: order.id } });
    expect(updated.status).toBe("realizado");
    expect(updated.date.toISOString().slice(0, 10)).toBe(ymd(newDateUtc));
    const updatedOrder = await prisma.serviceOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(updatedOrder.status).toBe("realizado");
    expect(updatedOrder.eventDate.toISOString().slice(0, 10)).toBe(ymd(newDateUtc)); // single-appointment OS: the OS's own date follows it

    const log = await prisma.appointmentRescheduleLog.findFirstOrThrow({ where: { appointmentId: updated.id } });
    expect(log.statusAtChange).toBe("realizado");
  });
});
