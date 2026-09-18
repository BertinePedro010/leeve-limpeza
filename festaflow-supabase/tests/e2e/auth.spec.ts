import { test, expect } from "@playwright/test";
import { clickNav } from "./helpers";

test.describe("Autenticação e rotas protegidas", () => {
  test("visitar /app sem sessão redireciona para /login", async ({ page }) => {
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login/);
  });

  test("login com credenciais erradas mostra mensagem de erro e não navega", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[type="email"]').fill("admin@teste.local");
    await page.locator('input[type="password"]').fill("SenhaErrada123!");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText(/invalid|incorret|inv[aá]lid/i)).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/login/);
  });

  // Usa "authtest@teste.local", uma conta dedicada só para estes 2 testes que
  // fazem login real pela UI. Fazer signInWithPassword de novo para
  // "operador@teste.local" (a mesma conta cujo storageState outros specs
  // reutilizam via tests/.auth/operador.json) invalida a sessão congelada
  // nesse arquivo assim que o novo login é emitido - descoberto rodando a
  // suíte inteira e vendo clients-crud.spec.ts/idor-and-permissions.spec.ts
  // falharem em cascata só depois que este arquivo re-logava como "operador".
  test("login com credenciais corretas chega no dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[type="email"]').fill("authtest@teste.local");
    await page.locator('input[type="password"]').fill("TesteAudit123!");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/app/);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  });

  test("sessão expirada em requisição autenticada volta para /login com aviso", async ({ page, context }) => {
    await page.goto("/login");
    await page.locator('input[type="email"]').fill("authtest@teste.local");
    await page.locator('input[type="password"]').fill("TesteAudit123!");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/app/);
    // Simula sessão expirada: derruba os cookies de sessão e força uma nova
    // chamada de API autenticada. Trocar de aba sozinho é pouco confiável
    // como gatilho (os dados da aba já podem estar carregados em memória,
    // sem novo fetch) - a busca de clientes SEMPRE dispara uma chamada
    // (debounce de 300ms em ClientsView), que é o gatilho real e determinístico
    // do redirecionamento em components/ui.tsx `api()`.
    await context.clearCookies();
    await clickNav(page, "Clientes");
    await page.getByLabel("Pesquisar cliente por nome ou CPF/CNPJ").fill("gatilho de refetch");
    await expect(page).toHaveURL(/\/login\?expired=1/, { timeout: 15000 });
    await expect(page.getByText(/sessao expirou/i)).toBeVisible();
  });
});

test.describe("logout", () => {
  // Login fresco (não reaproveita tests/.auth/*.json): "Sair" chama
  // supabase.auth.signOut(), que REVOGA a sessão no servidor. Reutilizar um
  // storageState compartilhado aqui invalidaria esse arquivo para todo teste
  // que rodasse depois na mesma suíte (era exatamente essa a causa da
  // cascata de falhas em clients-crud.spec.ts/idor-and-permissions.spec.ts
  // quando toda a suíte rodava em sequência) - login/logout descartáveis
  // isolam esse efeito colateral neste único teste.
  test("Sair encerra a sessão e bloqueia /app novamente", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[type="email"]').fill("authtest@teste.local");
    await page.locator('input[type="password"]').fill("TesteAudit123!");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/app/);
    await clickNav(page, "Sair");
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login/);
  });
});
