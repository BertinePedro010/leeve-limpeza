import { test, expect } from "@playwright/test";

test.use({ storageState: "tests/.auth/admin.json" });

const SCREENS: Array<[string, string]> = [
  ["Dashboard", "Dashboard"],
  ["Clientes", "Clientes"],
  ["Ordens de Servico", "Ordens de Servico"],
  ["Calendario", "Calendario"],
  ["Financeiro", "Financeiro"],
  ["Relatorios", "Relatorios"],
];

test.describe("Responsividade em 360px (sem scroll horizontal)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-360", "roda só no projeto mobile-360");
    await page.goto("/app");
  });

  test("o menu lateral começa fechado e abre pelo botão hamburguer", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Abrir menu" })).toBeVisible();
    await page.getByRole("button", { name: "Abrir menu" }).click();
    await expect(page.getByRole("button", { name: "Dashboard" })).toBeVisible();
  });

  for (const [navLabel, heading] of SCREENS) {
    test(`${heading}: sem overflow horizontal em 360px`, async ({ page }) => {
      await page.getByRole("button", { name: "Abrir menu" }).click();
      await page.getByRole("button", { name: navLabel, exact: true }).click();
      await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible({ timeout: 10000 });
      const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      expect(hasHorizontalOverflow, `${heading} tem scroll horizontal em 360px`).toBe(false);
    });
  }
});

test.describe("Calendario: proporcao das colunas no desktop", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "roda só no projeto desktop");
    await page.goto("/app");
    await page.getByRole("button", { name: "Calendario", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Calendario", level: 2 })).toBeVisible();
  });

  test("a lista de atendimentos ocupa mais largura que o calendario, sem overflow horizontal", async ({ page }) => {
    const monthGrid = page.locator(".grid.grid-cols-7").first();
    const appointmentsPanel = page.getByRole("heading", { name: /Atendimentos/ }).locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]");
    await expect(monthGrid).toBeVisible({ timeout: 10000 });
    await expect(appointmentsPanel).toBeVisible();

    const gridWidth = await monthGrid.evaluate((el) => el.getBoundingClientRect().width);
    const panelWidth = await appointmentsPanel.evaluate((el) => el.getBoundingClientRect().width);
    expect(panelWidth).toBeGreaterThan(gridWidth); // list wider than calendar, per the new lg:grid-cols-5 (2/5 vs 3/5) ratio

    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(hasHorizontalOverflow, "Calendario tem scroll horizontal no desktop apos o redimensionamento").toBe(false);
  });
});

test.describe("Estados de carregamento e erro", () => {
  test("uma requisição de API que falha não deixa a tela em branco (Error Boundary / mensagem)", async ({ page }) => {
    // Força a rota de dashboard a devolver erro para provar que a tela mostra
    // algo além de branco/quebrado quando uma chamada falha.
    await page.route("**/api/dashboard*", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Erro forçado pelo teste" }) }));
    await page.goto("/app");
    // A tela não deve travar completamente: pelo menos a navegação lateral
    // (que não depende do dashboard) continua visível/funcional.
    await expect(page.getByRole("button", { name: "Clientes" })).toBeVisible({ timeout: 10000 });
  });
});
