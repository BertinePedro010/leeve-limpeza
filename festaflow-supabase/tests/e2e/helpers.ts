import type { Page } from "@playwright/test";

// Em 360px o menu lateral começa fechado (translate-x-full) - os botões de
// navegação existem no DOM mas ficam fora da viewport, então um clique direto
// trava até o timeout. Em telas largas o hamburguer nem aparece. Usado por
// qualquer spec que precisa trocar de aba ou clicar em "Sair" nos dois
// viewports (ver components/SaasApp.tsx: aside com sidebarOpen).
export async function clickNav(page: Page, label: string) {
  const hamburger = page.getByRole("button", { name: "Abrir menu" });
  if (await hamburger.isVisible().catch(() => false)) {
    await hamburger.click();
  }
  await page.getByRole("button", { name: label, exact: true }).click();
}
