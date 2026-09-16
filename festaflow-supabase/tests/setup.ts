// Carrega .env.test (nunca .env.local) e trava a suíte inteira se as
// variáveis de ambiente não apontarem para o Supabase local. Isso é a
// principal rede de segurança contra rodar testes (que criam/apagam dados)
// contra o banco de producao por engano - ver regra de seguranca #1/#2 do
// pedido de auditoria.
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(__dirname, "../.env.test"), override: true });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const databaseUrl = process.env.DATABASE_URL ?? "";
const isLocal = (supabaseUrl.includes("127.0.0.1") || supabaseUrl.includes("localhost")) && (databaseUrl.includes("127.0.0.1") || databaseUrl.includes("localhost"));

if (!isLocal) {
  throw new Error(
    `Refusing to run tests: NEXT_PUBLIC_SUPABASE_URL/DATABASE_URL do not point to a local instance ` +
      `(got "${supabaseUrl}"). Tests must only ever run against .env.test's local Supabase stack, never production.`
  );
}
