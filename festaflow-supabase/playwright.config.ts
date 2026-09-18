import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, ".env.test"), override: true });

// Segurança: nunca deixa o Playwright subir contra outra coisa que não seja
// o Supabase local (ver tests/setup.ts para a mesma trava no Vitest).
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (!supabaseUrl.includes("127.0.0.1") && !supabaseUrl.includes("localhost")) {
  throw new Error(`Refusing to run Playwright: NEXT_PUBLIC_SUPABASE_URL is not local ("${supabaseUrl}").`);
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  // Serial de propósito: várias specs reutilizam o MESMO storageState
  // (tests/.auth/*.json, gerado uma única vez pelo setup). Com múltiplos
  // workers, vários contextos de navegador carregam o mesmo refresh token do
  // Supabase Auth quase ao mesmo tempo; a rotação de refresh token do
  // Supabase (enable_refresh_token_rotation=true, reuse window de 10s -
  // supabase/config.toml) invalida o token original assim que o primeiro
  // contexto o usa, derrubando a sessão dos demais e fazendo o app redirecionar
  // para /login?expired=1 no meio de um teste completamente não relacionado.
  // Rodar em série elimina a corrida (sem tentar reduzir o tempo de vida do
  // token só para acomodar o test runner).
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /global\.setup\.ts/ },
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, dependencies: ["setup"] },
    { name: "mobile-360", use: { viewport: { width: 360, height: 800 } }, dependencies: ["setup"] },
  ],
  // Porta dedicada (3100), nunca 3000: a maquina de desenvolvimento tem outro
  // projeto (nao relacionado) rodando em localhost:3000, e reuseExistingServer
  // faria o Playwright silenciosamente testar contra ELE em vez do
  // festaflow-supabase - foi exatamente isso que aconteceu na primeira tentativa.
  webServer: {
    command: "npm run dev -- -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
    env: process.env as Record<string, string>,
  },
});
