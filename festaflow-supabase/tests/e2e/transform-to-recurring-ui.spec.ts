import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import path from "node:path";
import dotenv from "dotenv";
import { clickNav } from "./helpers";

dotenv.config({ path: path.resolve(__dirname, "../../.env.test"), override: true });
const prisma = new PrismaClient();

test.use({ storageState: "tests/.auth/operador.json" });

// Real-browser click path for "Transformar em recorrencia" (the API-level
// correctness checks - adoption, duplicates, IDOR, concurrency - live in
// transform-to-recurring.spec.ts). This is the one test that actually drives
// the button + modal + confirm() dialog the way a real user would.
test.describe("Transformar em recorrencia - fluxo real no navegador", () => {
  test.afterAll(async () => prisma.$disconnect());

  test("clicar em 'Transformar em recorrencia', confirmar e ver a recorrencia refletida na OS", async ({ page }) => {
    const branchA = await prisma.branch.findUniqueOrThrow({ where: { name: "Filial Teste Norte" } });
    const suffix = `${Date.now()}`;
    const client = await prisma.client.create({ data: { branchId: branchA.id, name: `Cliente UI ${suffix}`, addressStreet: "Rua UI", addressNumber: "1", addressNeighborhood: "Bairro", addressCity: "Vitoria", addressState: "ES" } });
    const service = await prisma.service.create({ data: { branchId: branchA.id, name: `Servico UI ${suffix}`, price: 135, durationHours: 2, category: "Teste", active: true } });
    const eventDate = new Date();
    eventDate.setUTCDate(eventDate.getUTCDate() + 14);
    const eventDateUtc = new Date(Date.UTC(eventDate.getUTCFullYear(), eventDate.getUTCMonth(), eventDate.getUTCDate()));
    const order = await prisma.serviceOrder.create({
      data: {
        branchId: branchA.id, code: `OS-UITEST-${suffix}`, clientId: client.id,
        eventDate: eventDateUtc, startTime: "09:00", endTime: "11:00",
        location: "Rua UI, 1 - Vitoria - ES", addressStreet: "Rua UI", addressNumber: "1", addressNeighborhood: "Bairro", addressCity: "Vitoria", addressState: "ES",
        status: "agendado", totalAmount: 135,
        items: { create: [{ serviceId: service.id, quantity: 1, unitPrice: 135 }] },
      },
    });
    await prisma.appointment.create({ data: { orderId: order.id, branchId: branchA.id, date: eventDateUtc, startTime: "09:00", endTime: "11:00", status: "agendado" } });

    // Accepts both the "Deseja transformar esta OS..." confirm() and any
    // other dialog the flow might raise.
    page.on("dialog", (dialog) => dialog.accept());

    await page.goto("/app");
    await clickNav(page, "Ordens de Servico");
    await expect(page.getByRole("heading", { name: "Ordens de Servico", level: 2 })).toBeVisible();

    const row = page.locator("tr", { hasText: order.code });
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.getByRole("button", { name: "Transformar em recorrencia" }).click();

    await expect(page.getByRole("heading", { name: `Transformar OS ${order.code} em recorrencia` })).toBeVisible();
    await expect(page.getByText("Esta OS sera transformada em uma recorrencia. Os dados atuais foram preenchidos automaticamente.")).toBeVisible();
    // Client field is locked to the OS's own client (cannot be changed mid-transform).
    await expect(page.locator("select", { hasText: client.name })).toBeDisabled();

    // Every field is pre-filled (default frequency is "Mensal", which needs
    // no extra weekday selection) - submitting as-is exercises the real
    // "just confirm" happy path described in the feature spec.
    await page.getByRole("button", { name: "Salvar" }).click();

    await expect(page.getByRole("heading", { name: `Transformar OS ${order.code} em recorrencia` })).toHaveCount(0, { timeout: 10000 });
    // The row now shows "Recorrencia configurada" instead of the action button.
    await expect(row.getByText("Recorrencia configurada")).toBeVisible({ timeout: 10000 });

    const updated = await prisma.serviceOrder.findUniqueOrThrow({ where: { id: order.id }, include: { recurringSchedules: true, appointments: true } });
    expect(updated.recurringSchedules).toHaveLength(1);
    expect(updated.appointments.length).toBeGreaterThanOrEqual(1); // original preserved (more, if the horizon already reached a 2nd month)
    expect(updated.appointments.every((a) => a.recurringScheduleId === updated.recurringSchedules[0].id)).toBe(true);
  });
});
