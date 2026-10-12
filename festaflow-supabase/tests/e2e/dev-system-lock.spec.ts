import { test, expect, request, type BrowserContext } from "@playwright/test";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../.env.test"), override: true });

const PASSWORD = "TesteAudit123!";
const DEV_EMAIL = "dev@teste.local";
const developerUserId = process.env.DEVELOPER_USER_ID;

test.describe("Painel de desenvolvedor e bloqueio geral do sistema", () => {
  // DEVELOPER_USER_ID varia por ambiente local (o UUID e gerado pelo
  // Supabase Auth ao criar a conta de teste) - sem ele configurado em
  // .env.test, pula a suite inteira com um motivo claro em vez de falhar ou
  // fingir que passou (ver prisma/seed.test.ts e .env.test).
  test.skip(!developerUserId, "DEVELOPER_USER_ID nao configurado em .env.test - rode `npm run seed:test`, copie o UUID impresso para dev@teste.local e tente de novo.");

  let devStorageState: Awaited<ReturnType<BrowserContext["storageState"]>>;

  test.beforeAll(async ({ browser }) => {
    // Login local deste spec, nunca gravado em tests/.auth/*.json (que
    // outros specs dependem com usuarios fixos) - a conta de desenvolvedor
    // so existe/so e relevante aqui.
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/dev/login");
    await page.locator('input[type="email"]').fill(DEV_EMAIL);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/dev$/, { timeout: 15000 });
    devStorageState = await context.storageState();
    await context.close();
  });

  test.afterEach(async () => {
    // Sempre devolve o sistema para desbloqueado, mesmo se uma asserção
    // acima falhar no meio do teste - a suite inteira (serial, workers: 1)
    // depende de um sistema desbloqueado.
    const ctx = await request.newContext({ baseURL: "http://localhost:3100", storageState: devStorageState });
    await ctx.post("/api/dev/system-lock", { data: { action: "unblock" } }).catch(() => {});
    await ctx.dispose();
  });

  test("desenvolvedor autorizado consegue logar e abrir o painel", async ({ browser }) => {
    const context = await browser.newContext({ storageState: devStorageState });
    const page = await context.newPage();
    await page.goto("/dev");
    await expect(page).toHaveURL(/\/dev$/);
    await expect(page.getByText("Painel de desenvolvedor")).toBeVisible();
    await context.close();
  });

  test("admin comum nao consegue abrir o painel de desenvolvedor (redireciona para /dev/login)", async ({ browser }) => {
    const context = await browser.newContext({ storageState: "tests/.auth/admin.json" });
    const page = await context.newPage();
    await page.goto("/dev");
    await expect(page).toHaveURL(/\/dev\/login/);
    await context.close();
  });

  test("funcionario nao consegue bloquear nem desbloquear via chamada direta a API", async () => {
    const ctx = await request.newContext({ storageState: "tests/.auth/funcionario.json", baseURL: "http://localhost:3100" });
    const res = await ctx.post("/api/dev/system-lock", { data: { action: "block" } });
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  test("usuario sem sessao nenhuma recebe 401/403/503 na API de desenvolvedor, nunca libera", async () => {
    const ctx = await request.newContext({ baseURL: "http://localhost:3100" });
    const res = await ctx.get("/api/dev/system-lock");
    expect([401, 403, 503]).toContain(res.status());
    await ctx.dispose();
  });

  test("operador com sessao valida (mas que nao e o desenvolvedor) recebe 403 na API de desenvolvedor", async () => {
    const ctx = await request.newContext({ storageState: "tests/.auth/operador.json", baseURL: "http://localhost:3100" });
    const res = await ctx.get("/api/dev/system-lock");
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  test("ativar o bloqueio: API protegida responde 423 com o code esperado, /app redireciona para /blocked, e o desenvolvedor continua acessando o painel", async ({ browser }) => {
    const devCtx = await request.newContext({ baseURL: "http://localhost:3100", storageState: devStorageState });
    const blockRes = await devCtx.post("/api/dev/system-lock", { data: { action: "block", reason: "teste automatizado" } });
    expect(blockRes.status()).toBe(200);
    expect((await blockRes.json()).isBlocked).toBe(true);

    const opCtx = await request.newContext({ storageState: "tests/.auth/operador.json", baseURL: "http://localhost:3100" });
    const clientsRes = await opCtx.get("/api/clients");
    expect(clientsRes.status()).toBe(423);
    expect((await clientsRes.json()).code).toBe("SYSTEM_ACCESS_BLOCKED");
    await opCtx.dispose();

    const opContext = await browser.newContext({ storageState: "tests/.auth/operador.json" });
    const opPage = await opContext.newPage();
    await opPage.goto("/app");
    await expect(opPage).toHaveURL(/\/blocked/);
    await expect(opPage.getByText("Acesso temporariamente bloqueado")).toBeVisible();
    await opContext.close();

    const devPanelCtx = await request.newContext({ baseURL: "http://localhost:3100", storageState: devStorageState });
    expect((await devPanelCtx.get("/api/dev/system-lock")).status()).toBe(200);
    await devPanelCtx.dispose();

    await devCtx.dispose();
  });

  test("desbloquear restaura o acesso normal sem exigir novo login", async ({ browser }) => {
    const devCtx = await request.newContext({ baseURL: "http://localhost:3100", storageState: devStorageState });
    await devCtx.post("/api/dev/system-lock", { data: { action: "block" } });

    // Mesmo contexto de navegador do operador, criado DEPOIS do bloqueio mas
    // sem nenhum logout/login novo entre a chamada bloqueada e a liberada -
    // a sessao e a mesma nas duas chamadas.
    const opContext = await browser.newContext({ storageState: "tests/.auth/operador.json" });
    const blockedRes = await opContext.request.get("/api/clients");
    expect(blockedRes.status()).toBe(423);

    await devCtx.post("/api/dev/system-lock", { data: { action: "unblock" } });

    const unblockedRes = await opContext.request.get("/api/clients");
    expect(unblockedRes.status()).toBe(200);
    await opContext.close();
    await devCtx.dispose();
  });
});
