import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import path from "node:path";
import dotenv from "dotenv";
import { clickNav } from "./helpers";

dotenv.config({ path: path.resolve(__dirname, "../../.env.test"), override: true });
const prisma = new PrismaClient();

test.use({ storageState: "tests/.auth/operador.json" });

// Regression coverage for the requirement that the Calendario day panel shows
// the correct atendimento count next to the selected day, counted from
// Appointment rows (one per occurrence) and NEVER inflated by how many
// ServiceOrderItem rows a single OS happens to carry.
test.describe("Calendario: contagem de atendimentos do dia selecionado", () => {
  test.afterAll(async () => prisma.$disconnect());

  test("uma OS com 3 servicos ainda conta como 1 atendimento - o total do dia soma OS distintas, nao servicos", async ({ page }) => {
    const branchA = await prisma.branch.findUniqueOrThrow({ where: { name: "Filial Teste Norte" } });
    const suffix = `${Date.now()}`;
    const client = await prisma.client.create({ data: { branchId: branchA.id, name: `Cliente Contagem ${suffix}`, addressStreet: "Rua Contagem", addressNumber: "1", addressNeighborhood: "Bairro", addressCity: "Vitoria", addressState: "ES" } });
    const serviceA = await prisma.service.create({ data: { branchId: branchA.id, name: `Servico Contagem A ${suffix}`, price: 100, durationHours: 1, category: "Teste", active: true } });
    const serviceB = await prisma.service.create({ data: { branchId: branchA.id, name: `Servico Contagem B ${suffix}`, price: 150, durationHours: 1, category: "Teste", active: true } });
    const today = new Date();
    const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

    // OS #1: a single Appointment, but THREE ServiceOrderItem rows.
    const orderMultiService = await prisma.serviceOrder.create({
      data: {
        branchId: branchA.id, code: `OS-CONTMULTI-${suffix}`, clientId: client.id,
        eventDate: todayUtc, startTime: "09:00", endTime: "11:00",
        location: "Rua Contagem, 1 - Vitoria - ES", addressStreet: "Rua Contagem", addressNumber: "1", addressNeighborhood: "Bairro", addressCity: "Vitoria", addressState: "ES",
        status: "agendado", totalAmount: 350,
        items: { create: [{ serviceId: serviceA.id, quantity: 1, unitPrice: 100 }, { serviceId: serviceB.id, quantity: 1, unitPrice: 150 }, { serviceId: serviceA.id, quantity: 1, unitPrice: 100 }] },
      },
    });
    await prisma.appointment.create({ data: { orderId: orderMultiService.id, branchId: branchA.id, date: todayUtc, startTime: "09:00", endTime: "11:00", status: "agendado" } });

    // OS #2: a second, unrelated OS on the same day (a single service).
    const orderSingle = await prisma.serviceOrder.create({
      data: {
        branchId: branchA.id, code: `OS-CONTSINGLE-${suffix}`, clientId: client.id,
        eventDate: todayUtc, startTime: "14:00", endTime: "15:00",
        location: "Rua Contagem, 1 - Vitoria - ES", addressStreet: "Rua Contagem", addressNumber: "1", addressNeighborhood: "Bairro", addressCity: "Vitoria", addressState: "ES",
        status: "agendado", totalAmount: 100,
        items: { create: [{ serviceId: serviceA.id, quantity: 1, unitPrice: 100 }] },
      },
    });
    await prisma.appointment.create({ data: { orderId: orderSingle.id, branchId: branchA.id, date: todayUtc, startTime: "14:00", endTime: "15:00", status: "agendado" } });

    await page.goto("/app");
    await clickNav(page, "Calendario");

    // The panel opens already selecting today - exactly 2 atendimentos
    // (2 Appointment rows), never 4 (2 appointments + the extra 2 items on
    // OS #1 miscounted as if they were separate occurrences).
    await expect(page.getByRole("heading", { name: /Atendimentos.*·\s*2\s*atendimentos/ })).toBeVisible({ timeout: 10000 });

    const panel = page.getByRole("heading", { name: /Atendimentos/ }).locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]");
    await expect(panel.getByText(orderMultiService.code)).toBeVisible();
    await expect(panel.getByText(orderSingle.code)).toBeVisible();
  });
});
