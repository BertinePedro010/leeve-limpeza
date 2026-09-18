import { test, expect } from "@playwright/test";
import { clickNav } from "./helpers";

test.use({ storageState: "tests/.auth/operador.json" });

test.describe("Clientes - CRUD e validações", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/app");
    await clickNav(page, "Clientes");
    // A tela tem 2 headings "Clientes": o <h2> do cabeçalho (nome da aba
    // ativa) e o <h3> do CrudShell (título da seção) - level:3 mira o
    // segundo, que só existe quando a view de fato renderizou.
    await expect(page.getByRole("heading", { name: "Clientes", level: 3 })).toBeVisible();
  });

  test("cria, edita e exclui um cliente (fluxo completo)", async ({ page }) => {
    const uniqueName = `Cliente E2E ${Date.now()}`;
    await page.getByRole("button", { name: "Novo", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Novo cliente" })).toBeVisible();

    await page.locator("#client-field-name").fill(uniqueName);
    await page.locator("#client-field-addressStreet").fill("Rua de Teste E2E");
    await page.locator("#client-field-addressNumber").fill("42");
    await page.locator("#client-field-addressNeighborhood").fill("Bairro Teste");
    await page.locator("#client-field-addressState").selectOption("ES");
    await page.locator("#client-field-addressCity").fill("Vitória");
    await page.getByRole("button", { name: "Salvar" }).click();

    await expect(page.getByRole("heading", { name: uniqueName })).toBeVisible({ timeout: 10000 });

    // Edita
    const card = page.locator("div.rounded-2xl.border.bg-white", { hasText: uniqueName });
    await card.getByRole("button", { name: "Editar" }).click();
    await expect(page.getByRole("heading", { name: "Editar cliente" })).toBeVisible();
    const editedName = `${uniqueName} (editado)`;
    await page.locator("#client-field-name").fill(editedName);
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByRole("heading", { name: editedName })).toBeVisible({ timeout: 10000 });

    // Exclui
    page.once("dialog", (dialog) => dialog.accept());
    const editedCard = page.locator("div.rounded-2xl.border.bg-white", { hasText: editedName });
    await editedCard.getByRole("button", { name: "Excluir" }).click();
    await expect(page.getByRole("heading", { name: editedName })).toHaveCount(0, { timeout: 10000 });
  });

  test("bloqueia salvar sem os campos obrigatórios de endereço", async ({ page }) => {
    await page.getByRole("button", { name: "Novo", exact: true }).click();
    await page.locator("#client-field-name").fill("Cliente Sem Endereco");
    // Rua/Numero/Bairro/Cidade/Estado ficam em branco de proposito.
    await page.getByRole("button", { name: "Salvar" }).click();
    // Campo obrigatorio nativo (`required`) impede o submit e mantem o modal aberto.
    await expect(page.getByRole("heading", { name: "Novo cliente" })).toBeVisible();
  });

  test("recusa e-mail em formato inválido com uma mensagem clara", async ({ page }) => {
    await page.getByRole("button", { name: "Novo", exact: true }).click();
    await page.locator("#client-field-name").fill(`Cliente Email Invalido ${Date.now()}`);
    await page.locator("#client-field-email").fill("nao-e-um-email");
    await page.locator("#client-field-addressStreet").fill("Rua X");
    await page.locator("#client-field-addressNumber").fill("1");
    await page.locator("#client-field-addressNeighborhood").fill("Centro");
    await page.locator("#client-field-addressState").selectOption("ES");
    await page.locator("#client-field-addressCity").fill("Vitória");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.locator("#client-field-email-error")).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("heading", { name: "Novo cliente" })).toBeVisible();
  });

  test("bloqueia CPF/CNPJ duplicado para o mesmo nome na mesma filial", async ({ page }) => {
    // "João da Silva Ção" + documento 111.444.777-35 já existem no seed
    // (prisma/seed.test.ts) para a Filial Teste Norte.
    await page.getByRole("button", { name: "Novo", exact: true }).click();
    await page.locator("#client-field-name").fill("João da Silva Ção");
    await page.locator("#client-field-document").fill("111.444.777-35");
    await page.locator("#client-field-addressStreet").fill("Rua Y");
    await page.locator("#client-field-addressNumber").fill("2");
    await page.locator("#client-field-addressNeighborhood").fill("Centro");
    await page.locator("#client-field-addressState").selectOption("ES");
    await page.locator("#client-field-addressCity").fill("Vitória");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.locator("#client-field-document-error")).toBeVisible({ timeout: 5000 });
  });

  test("pesquisa por CPF/CNPJ (parcial, ignorando pontuação) encontra o cliente certo", async ({ page }) => {
    await page.getByLabel("Pesquisar cliente por nome ou CPF/CNPJ").fill("11144477735");
    await expect(page.getByRole("heading", { name: /joão da silva ção/i }).first()).toBeVisible({ timeout: 10000 });
  });

  test("mostra 'Nenhum cliente encontrado' para uma busca sem resultado (estado vazio)", async ({ page }) => {
    await page.getByLabel("Pesquisar cliente por nome ou CPF/CNPJ").fill("zzzzzzzznaoexiste");
    await expect(page.getByText("Nenhum cliente encontrado.")).toBeVisible({ timeout: 10000 });
  });
});
