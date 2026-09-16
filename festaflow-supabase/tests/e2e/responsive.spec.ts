import { test, expect } from "@playwright/test";

test.use({ storageState: "tests/.auth/admin.json" });

const SCREENS: Array<[string, string]> = [
  ["Dashboard", "Dashboard"],
  ["Clientes", "Clientes"],
  ["Ordens de Servico", "Ordens de Servico"],
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
