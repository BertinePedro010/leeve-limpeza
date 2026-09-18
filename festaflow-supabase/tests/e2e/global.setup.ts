import { test as setup, expect } from "@playwright/test";
import path from "node:path";

const AUTH_DIR = path.resolve(__dirname, "../.auth");
const PASSWORD = "TesteAudit123!";

async function loginAs(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/app/, { timeout: 15000 });
}

setup("autenticar admin", async ({ page }) => {
  await loginAs(page, "admin@teste.local");
  await page.context().storageState({ path: path.join(AUTH_DIR, "admin.json") });
});

setup("autenticar operador", async ({ page }) => {
  await loginAs(page, "operador@teste.local");
  await page.context().storageState({ path: path.join(AUTH_DIR, "operador.json") });
});

setup("autenticar funcionario", async ({ page }) => {
  await loginAs(page, "funcionario@teste.local");
  await page.context().storageState({ path: path.join(AUTH_DIR, "funcionario.json") });
});
