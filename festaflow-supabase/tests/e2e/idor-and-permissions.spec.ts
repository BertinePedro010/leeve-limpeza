import { test, expect, request } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../.env.test"), override: true });
const prisma = new PrismaClient();

test.describe("IDOR entre filiais (operador só tem acesso à Filial Teste Norte)", () => {
  let branchBClientId: string;
  let branchBOrderId: string;
  let branchBId: string;

  test.beforeAll(async () => {
    const branchB = await prisma.branch.findUniqueOrThrow({ where: { name: "Filial Teste Sul" } });
    branchBId = branchB.id;
    const client = await prisma.client.findFirstOrThrow({ where: { branchId: branchB.id } });
    const order = await prisma.serviceOrder.findFirstOrThrow({ where: { branchId: branchB.id } });
    branchBClientId = client.id;
    branchBOrderId = order.id;
  });

  test.afterAll(async () => prisma.$disconnect());

  // /api/clients/[id] só implementa PUT e DELETE (nenhum GET individual - a
  // edição na UI reaproveita o registro já carregado na listagem da própria
  // filial, ver ClientsView em components/SaasApp.tsx), então o teste de
  // IDOR usa DELETE, o método real que a rota expõe.
  test("DELETE de um cliente de outra filial retorna 404 (nunca 403, para não confirmar existência)", async () => {
    const ctx = await request.newContext({ storageState: "tests/.auth/operador.json", baseURL: "http://localhost:3100" });
    const res = await ctx.delete(`/api/clients/${branchBClientId}`);
    expect(res.status()).toBe(404);
    await ctx.dispose();
    // Confirma que o registro realmente NÃO foi apagado (o 404 é por
    // isolamento de filial, não porque o cliente já não existia).
    const stillExists = await prisma.client.findUnique({ where: { id: branchBClientId } });
    expect(stillExists).not.toBeNull();
  });

  test("GET de uma OS de outra filial retorna 404", async () => {
    const ctx = await request.newContext({ storageState: "tests/.auth/operador.json", baseURL: "http://localhost:3100" });
    const res = await ctx.get(`/api/orders/${branchBOrderId}`);
    expect(res.status()).toBe(404);
    await ctx.dispose();
  });

  test("PUT tentando editar um cliente de outra filial também é bloqueado (404), não só a leitura", async () => {
    const ctx = await request.newContext({ storageState: "tests/.auth/operador.json", baseURL: "http://localhost:3100" });
    const res = await ctx.put(`/api/clients/${branchBClientId}`, { data: { name: "Nome Forjado" } });
    expect([403, 404]).toContain(res.status());
    await ctx.dispose();
  });

  test("listagem de clientes filtrada por outra filial não vaza registros (assertBranchAccess)", async () => {
    const ctx = await request.newContext({ storageState: "tests/.auth/operador.json", baseURL: "http://localhost:3100" });
    const res = await ctx.get(`/api/clients?branchId=${branchBId}`);
    expect([403, 404]).toContain(res.status());
    await ctx.dispose();
  });

  test("um usuário sem sessão (sem cookies) recebe 401 da API, nunca dados", async () => {
    const ctx = await request.newContext({ baseURL: "http://localhost:3100" });
    const res = await ctx.get(`/api/orders/${branchBOrderId}`);
    expect(res.status()).toBe(401);
    await ctx.dispose();
  });
});

test.describe("Permissões por módulo (funcionario só tem 'calendar' em allowedModules)", () => {
  test("funcionario recebe 403 ao chamar a API de clientes diretamente, mesmo tendo sessão válida", async () => {
    const ctx = await request.newContext({ storageState: "tests/.auth/funcionario.json", baseURL: "http://localhost:3100" });
    const res = await ctx.get(`/api/clients`);
    expect(res.status()).toBe(403);
    await ctx.dispose();
  });

  test("funcionario não vê os itens de navegação de módulos que não tem acesso", async ({ browser }) => {
    const context = await browser.newContext({ storageState: "tests/.auth/funcionario.json" });
    const page = await context.newPage();
    await page.goto("/app");
    await expect(page.getByRole("button", { name: "Clientes" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Financeiro" })).toHaveCount(0);
    await context.close();
  });

  test("rotas exclusivas de admin global (Filiais/Usuarios) só aparecem para o admin", async ({ browser }) => {
    const opContext = await browser.newContext({ storageState: "tests/.auth/operador.json" });
    const opPage = await opContext.newPage();
    await opPage.goto("/app");
    await expect(opPage.getByRole("button", { name: "Filiais" })).toHaveCount(0);
    await expect(opPage.getByRole("button", { name: "Usuarios" })).toHaveCount(0);
    await opContext.close();

    const adminContext = await browser.newContext({ storageState: "tests/.auth/admin.json" });
    const adminPage = await adminContext.newPage();
    await adminPage.goto("/app");
    await expect(adminPage.getByRole("button", { name: "Filiais" })).toBeVisible();
    await expect(adminPage.getByRole("button", { name: "Usuarios" })).toBeVisible();
    await adminContext.close();
  });
});
