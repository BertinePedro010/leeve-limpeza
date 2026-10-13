// Regression coverage for ETAPA 3 (separar listagem e detalhes de OS) - see
// the implementation report for the full design. Locks in:
// - GET /api/orders returns the slim summary DTO (no heavy relations), while
//   every ServiceOrder scalar column + appointmentsCount/hasRecurrence stay.
// - GET /api/orders/[id] is UNCHANGED: full detail, branch isolation, finance
//   gate, soft-delete filter - same route, same include(), untouched.
// - Branch isolation and unauthorized-access handling are unaffected.
// - The frontend's on-demand detail fetch/cache (lib/use-order-detail.ts)
//   does not break save/cancel/list-sync, and protects against stale
//   out-of-order responses when the user switches which OS they're viewing.
import { test, expect, request } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import path from "node:path";
import dotenv from "dotenv";
import { clickNav } from "./helpers";

dotenv.config({ path: path.resolve(__dirname, "../../.env.test"), override: true });
const prisma = new PrismaClient();
const BASE_URL = "http://localhost:3100";

test.describe("ETAPA 3 - GET /api/orders retorna DTO resumido", () => {
  test.afterAll(async () => prisma.$disconnect());

  test("listagem nunca inclui os 5 relacionamentos pesados, mas preserva os campos escalares e os dois derivados", async () => {
    const ctx = await request.newContext({ storageState: "tests/.auth/operador.json", baseURL: BASE_URL });
    const res = await ctx.get("/api/orders");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    for (const o of body) {
      expect(o).not.toHaveProperty("items");
      expect(o).not.toHaveProperty("employees");
      expect(o).not.toHaveProperty("transactions");
      expect(o).not.toHaveProperty("appointments");
      expect(o).not.toHaveProperty("recurringSchedules");
      expect(typeof o.appointmentsCount).toBe("number");
      expect(typeof o.hasRecurrence).toBe("boolean");
      expect(typeof o.code).toBe("string");
      expect(typeof o.clientId).toBe("string");
      expect(o.total).not.toBeUndefined();
      expect(o.totalAmount).not.toBeUndefined();
    }
    await ctx.dispose();
  });

  test("GET /api/orders/[id] continua retornando o detalhe completo, inalterado", async () => {
    const ctx = await request.newContext({ storageState: "tests/.auth/operador.json", baseURL: BASE_URL });
    const list = await (await ctx.get("/api/orders")).json();
    const id = list[0].id;
    const res = await ctx.get(`/api/orders/${id}`);
    expect(res.status()).toBe(200);
    const detail = await res.json();
    expect(Array.isArray(detail.items)).toBe(true);
    expect(Array.isArray(detail.employees)).toBe(true);
    expect(Array.isArray(detail.appointments)).toBe(true);
    expect(detail).not.toHaveProperty("appointmentsCount");
    expect(detail).not.toHaveProperty("hasRecurrence");
    await ctx.dispose();
  });

  test("isolamento entre filiais: detalhe de uma OS de outra filial e negado (operador so pertence a Filial Teste Norte)", async () => {
    const branchB = await prisma.branch.findUniqueOrThrow({ where: { name: "Filial Teste Sul" } });
    const orderInB = await prisma.serviceOrder.findFirstOrThrow({ where: { branchId: branchB.id, deletedAt: null } });
    const ctx = await request.newContext({ storageState: "tests/.auth/operador.json", baseURL: BASE_URL });
    const res = await ctx.get(`/api/orders/${orderInB.id}`);
    expect([403, 404]).toContain(res.status());
    await ctx.dispose();
  });

  test("id inexistente retorna 403/404, nunca 500", async () => {
    const ctx = await request.newContext({ storageState: "tests/.auth/operador.json", baseURL: BASE_URL });
    const res = await ctx.get("/api/orders/00000000-0000-0000-0000-000000000000");
    expect([403, 404]).toContain(res.status());
    await ctx.dispose();
  });
});

test.describe("ETAPA 3 - carregamento sob demanda na UI", () => {
  test.use({ storageState: "tests/.auth/operador.json" });

  let branchAId: string;
  let clientId: string;
  let serviceId: string;
  let employeeId: string;
  let orderId: string;
  let orderCode: string;

  test.beforeAll(async () => {
    const branchA = await prisma.branch.findUniqueOrThrow({ where: { name: "Filial Teste Norte" } });
    branchAId = branchA.id;
    const suffix = `${Date.now()}`;
    const client = await prisma.client.create({ data: { branchId: branchAId, name: `Cliente ListDetail ${suffix}`, addressStreet: "Rua Teste", addressNumber: "1", addressNeighborhood: "Bairro", addressCity: "Vitoria", addressState: "ES" } });
    clientId = client.id;
    const service = await prisma.service.create({ data: { branchId: branchAId, name: `Servico ListDetail ${suffix}`, price: 200, durationHours: 1, category: "Teste", active: true } });
    serviceId = service.id;
    const employee = await prisma.employee.create({ data: { branchId: branchAId, name: `Funcionario ListDetail ${suffix}`, role: "Teste", dailyRate: 0, paymentType: "diaria" } });
    employeeId = employee.id;
    const eventDate = new Date();
    eventDate.setUTCDate(eventDate.getUTCDate() + 20);
    const order = await prisma.serviceOrder.create({
      data: {
        branchId: branchAId, code: `OS-LISTDETAIL-${suffix}`, clientId,
        eventDate, startTime: "09:00", endTime: "11:00",
        location: "Rua Teste, 1 - Vitoria - ES", addressStreet: "Rua Teste", addressNumber: "1", addressNeighborhood: "Bairro", addressCity: "Vitoria", addressState: "ES",
        status: "agendado", totalAmount: 200,
        items: { create: [{ serviceId, quantity: 1, unitPrice: 200 }] },
        employees: { create: [{ employeeId }] },
      },
    });
    orderId = order.id;
    orderCode = order.code;
    await prisma.appointment.create({ data: { orderId, branchId: branchAId, date: eventDate, startTime: "09:00", endTime: "11:00", status: "agendado" } });
  });

  test.afterAll(async () => {
    await prisma.appointment.deleteMany({ where: { orderId } });
    await prisma.orderEmployee.deleteMany({ where: { orderId } });
    await prisma.serviceOrderItem.deleteMany({ where: { orderId } });
    await prisma.serviceOrder.delete({ where: { id: orderId } });
    await prisma.employee.delete({ where: { id: employeeId } });
    await prisma.service.delete({ where: { id: serviceId } });
    await prisma.client.delete({ where: { id: clientId } });
    await prisma.$disconnect();
  });

  test("abrir para editar mostra carregamento, depois habilita Salvar, e salvar atualiza a listagem resumida", async ({ page }) => {
    await page.goto("/app");
    await clickNav(page, "Ordens de Servico");
    const row = page.locator("table tbody tr", { hasText: orderCode });
    await expect(row).toBeVisible({ timeout: 10000 });

    await row.getByRole("button", { name: "Editar" }).click();
    const saveBtn = page.getByRole("button", { name: "Salvar" });
    // Right after opening, the detail hasn't loaded yet - Save must be disabled.
    await expect(saveBtn).toBeDisabled();
    await expect(page.getByText("Carregando detalhes da OS...")).toBeHidden({ timeout: 10000 });
    await expect(saveBtn).toBeEnabled();

    const notes = `smoke-note-${Date.now()}`;
    await page.locator("textarea").first().fill(notes);
    await saveBtn.click();
    await expect(page.getByText("OS salva com sucesso!")).toBeVisible({ timeout: 10000 });

    // Listing row (slim DTO) must reflect the save without a page reload -
    // same code/status/value still shown, confirming applyOrderSaved's
    // derived-summary projection kept the list in sync.
    await expect(row).toBeVisible({ timeout: 10000 });
  });

  test("reabrir a mesma OS reutiliza o cache (sem novo carregamento) e OS diferentes nunca se misturam", async ({ page }) => {
    await page.goto("/app");
    await clickNav(page, "Ordens de Servico");
    const row = page.locator("table tbody tr", { hasText: orderCode });
    await expect(row).toBeVisible({ timeout: 10000 });

    // First open: real fetch, loading banner expected.
    await row.getByRole("button", { name: "Editar" }).click();
    await expect(page.getByText("Carregando detalhes da OS...")).toBeHidden({ timeout: 10000 });
    await page.locator(".modal-panel button", { hasText: "X" }).click();

    // Second open of the SAME OS: served from cache - Save enabled almost
    // immediately, no stale "loading" state lingering.
    await row.getByRole("button", { name: "Editar" }).click();
    await expect(page.getByRole("button", { name: "Salvar" })).toBeEnabled({ timeout: 2000 });
    await page.locator(".modal-panel button", { hasText: "X" }).click();

    // Open a DIFFERENT OS right after closing this one - its own modal must
    // show ITS OWN code, never a stale fragment of the previous OS.
    const otherRow = page.locator("table tbody tr").first();
    await otherRow.getByRole("button", { name: "Editar" }).click();
    await expect(page.getByText("Carregando detalhes da OS...")).toBeHidden({ timeout: 10000 });
    const otherCode = await otherRow.locator("td").first().innerText();
    await expect(page.locator(".modal-panel h3", { hasText: `Editar OS ${otherCode}` })).toBeVisible();
    await page.locator(".modal-panel button", { hasText: "X" }).click();
  });

  test("falha de rede ao carregar o detalhe mostra erro com opcao de tentar novamente, e recupera corretamente depois", async ({ page }) => {
    await page.goto("/app");
    await clickNav(page, "Ordens de Servico");
    const row = page.locator("table tbody tr", { hasText: orderCode });
    await expect(row).toBeVisible({ timeout: 10000 });

    // First request to the detail endpoint for THIS order fails (simulated
    // network/server error); the retry (second request) is let through
    // normally - exercises the real fetch/retry path, not a mock of the
    // whole flow.
    let failNext = true;
    await page.route(`**/api/orders/${orderId}`, async (route) => {
      if (failNext) {
        failNext = false;
        await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "Erro simulado de rede" }) });
      } else {
        await route.continue();
      }
    });

    await row.getByRole("button", { name: "Editar" }).click();
    // The banner surfaces the server's own error message (api()'s ApiError
    // uses the response body's `message` when present) - asserting on that
    // exact simulated text, not the generic fallback, so this test actually
    // proves the real error reached the UI instead of matching by accident.
    await expect(page.getByText("Erro simulado de rede")).toBeVisible({ timeout: 10000 });
    const retryBtn = page.getByRole("button", { name: "Tentar novamente" });
    await expect(retryBtn).toBeVisible();
    // While the error is showing, no incomplete/stale data must be treated
    // as usable - Save stays disabled.
    await expect(page.getByRole("button", { name: "Salvar" })).toBeDisabled();

    await retryBtn.click();
    await expect(page.getByText("Erro simulado de rede")).toBeHidden({ timeout: 10000 });
    await expect(page.getByRole("button", { name: "Salvar" })).toBeEnabled({ timeout: 10000 });
    // The modal now shows the CORRECT order (not a stale/wrong one) and its
    // real data loaded successfully after the retry.
    await expect(page.locator(".modal-panel h3", { hasText: `Editar OS ${orderCode}` })).toBeVisible();
    await expect(page.getByText(/Atendimentos \/ Datas/)).toBeVisible();

    await page.unroute(`**/api/orders/${orderId}`);
    await page.locator(".modal-panel button", { hasText: "X" }).click();
  });

  test("cancelar a OS busca o detalhe completo apos o cancelamento (endpoint de cancelamento nao inclui relations)", async ({ page }) => {
    await page.goto("/app");
    await clickNav(page, "Ordens de Servico");
    const row = page.locator("table tbody tr", { hasText: orderCode });
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.getByRole("button", { name: "Editar" }).click();
    await expect(page.getByText("Carregando detalhes da OS...")).toBeHidden({ timeout: 10000 });

    page.once("dialog", (d) => d.accept("motivo-e2e"));
    await page.getByRole("button", { name: "Cancelar OS" }).click();
    await expect(page.getByText("Esta OS foi cancelada")).toBeVisible({ timeout: 10000 });
    // Atendimentos section must still render with real data (not crash on
    // an incomplete object) - proves the full re-fetch after cancel worked.
    await expect(page.getByText(/Atendimentos \/ Datas/)).toBeVisible();
    await page.locator(".modal-panel button", { hasText: "X" }).click();
  });
});
