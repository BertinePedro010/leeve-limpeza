# Plano de Auditoria — LEVVE Limpeza (festaflow-supabase)

Status: **Fase 0 concluída — decisões aprovadas em 2026-09-16, iniciando Fase 1.**

Decisões do usuário:
1. Ambiente de teste: **Supabase CLI local via Docker** (`supabase start`).
2. Escopo: **apenas `festaflow-supabase/`**; demais pastas (`src/`, `festaflow-desktop/`, `local-api/`, `functions/`, `database/sqlserver/`) são legado, fora de escopo.
3. Desconto/rateio: **fora de escopo** — não existe essa regra de negócio no app hoje; não será implementada nesta auditoria.

## 0. Achado crítico (bloqueia a Fase 1 como planejada originalmente)

O único arquivo de ambiente presente no repositório (`festaflow-supabase/.env.local`)
aponta para o Supabase de **produção**:

- `NEXT_PUBLIC_SUPABASE_URL=https://muyfhshqnazlyockmxmy.supabase.co`
- `DATABASE_URL` via pooler desse mesmo projeto.

Confirmado por memória de sessões anteriores: esse projeto contém as filiais
reais do cliente ("Cachoeiro e Regiões", "Vitória/VV", "Serra") e admins com
e-mails reais. **Não existe hoje um projeto Supabase de teste nem Supabase CLI
local configurado neste repositório.**

Por regra de segurança #1/#2, não vou conectar, aplicar migrations, rodar
seed ou testes de carga/E2E contra esse banco. Preciso de uma destas
alternativas antes da Fase 1:

1. Você me passa credenciais de um **projeto Supabase de teste** separado; ou
2. Eu subo **Supabase CLI local** (`supabase start`, requer Docker Desktop
   rodando) — crio `.env.test` com as credenciais locais geradas e aplico as
   migrations existentes (todas já aditivas) + seed fictício nele; ou
3. Uso **PostgreSQL local em Docker** só com `prisma migrate deploy` (sem
   Supabase Auth/Storage) — mais rápido, mas login real via Supabase Auth
   fica fora do escopo testável (teria que ser mockado).

Nenhum comando de banco foi executado até aqui — só leitura de arquivos e
`.env.local` (nomes de variáveis e host mascarado, sem expor a senha).

**Aguardando sua decisão sobre qual opção seguir antes da Fase 1.**

## 1. Stack identificada

- App em produção: **`festaflow-supabase/`** (Next.js 15 App Router, React 19,
  TypeScript, Tailwind). Deploy: Vercel (`leeve-limpeza.vercel.app`, branch
  `master` → produção direta, sem staging).
- Banco: **Supabase Postgres** via **Prisma 6** (`@prisma/client`). Conexão de
  app usa o **pooler** (`pgbouncer=true&connection_limit=1`) em `DATABASE_URL`;
  `DIRECT_URL` para migrations.
- Auth: **Supabase Auth** (`@supabase/ssr` + `@supabase/supabase-js`), cookies
  de sessão. `middleware.ts` só faz refresh de cookie (não bloqueia nada);
  toda autorização real está em `lib/authz.ts::requireAuth()`, chamada em cada
  rota de API.
- Validação: **Zod** (`lib/validators.ts`).
- PDF: `pdfkit` (`lib/pdf.ts`). E-mail: `nodemailer` (`lib/email.ts`). WhatsApp:
  `lib/whatsapp.ts`.
- Outras pastas no repo (`src/`, `festaflow-desktop/`, `local-api/`,
  `functions/`, `database/sqlserver/`, `desktop/`) parecem ser **versões
  legadas/paralelas** (Electron, Firebase Functions, API local, SQL Server) —
  não fazem parte do sistema em produção hoje. Vou tratá-las como fora de
  escopo da auditoria, a menos que você confirme que alguma ainda está em uso.
  **Preciso confirmar isso com você antes de ignorá-las de vez.**
- Sem testes hoje: nenhum arquivo `*.test.*`/`*.spec.*`, sem `vitest.config`
  nem `playwright.config`, sem script `test` no `package.json`. Vitest e
  Playwright precisam ser configurados do zero (Fase 2).

## 2. Mapa de módulos e operações (via `app/api/*` e `components/`)

| Módulo | Rotas/telas | Operações |
|---|---|---|
| Auth | `/login`, `/auth/callback`, `middleware.ts` | login, callback OAuth/magic link, refresh de sessão |
| Dashboard | `/app` (page), `app/api/dashboard` | agregados de receita/despesa, OS do período, ocupação |
| Clientes | `app/api/clients[, /[id]]` | CRUD, dedupe CPF/CNPJ por filial (`lib/client-dedupe*.ts`), endereço estruturado (`lib/client-address.ts`) |
| Funcionários | `app/api/employees[, /[id]]` | CRUD, diária, vínculo com OS/appointments |
| Serviços | `app/api/services[, /[id]]` | CRUD, preço, duração, categoria |
| Ordens de Serviço (OS) | `app/api/orders[, /[id], /[id]/cancel, /[id]/pdf, /[id]/send, /summary]` | criar/editar/cancelar OS, itens (`ServiceOrderItem`), gerar PDF, enviar por e-mail/WhatsApp (`OrderSendLog`), código único global (`lib/order-code.ts`) |
| Recorrência | `app/api/recurring-schedules[, /[id], /[id]/generate]` | criar recorrência (semanal/quinzenal/mensal), gerar `Appointment`s futuros |
| Agenda/Calendário | `app/api/appointments[, /[id], /[id]/cancel, /[id]/complete]`, `app/api/calendar` | listar, cancelar, concluir ocorrência (dispara faturamento via `lib/billing.ts`) |
| Financeiro | `app/api/transactions[, /[id]]` | lançamentos receita/despesa, status pago/pendente, vínculo com OS/recorrência |
| Relatórios | `app/api/reports/{os,clients,clients/options,employees[/id],services,appointments,cancellations}` | agregações por período/filial |
| Usuários/Permissões | `app/api/users[, /[id], /[id]/reset-password]`, `app/api/me` | CRUD de usuário, papéis (admin/operador/funcionario), módulos permitidos, reset de senha |
| Filiais | `app/api/branches[, /[id], /count]` | CRUD de filial, `requireGlobalAdmin` |

## 3. Onde valores/totais são calculados (prioridade máxima da Fase 2)

- **`lib/order-total.ts`** — fonte única do "valor real de uma OS":
  `totalAmount × nº de ocorrências não canceladas`. Usada por dashboard, PDF,
  busca de cliente e relatórios (comentário no próprio arquivo reforça isso
  como "single source of truth").
- **`lib/billing.ts::syncOrderBilling`** — converte OS finalizada em
  `Transaction` de receita automática (`isAutoRevenue=true`), idempotente via
  índice único parcial; reverte (soft-delete) se a OS deixa de estar
  finalizada. `sumRevenue()` é a regra única de soma de receita usada por
  dashboard e relatório de OS.
- **`ServiceOrderItem`** guarda `quantity` + `unitPrice` (`Decimal(10,2)`) por
  item; `ServiceOrder.totalAmount` é o total já consolidado da OS.
- **Nenhum campo de desconto existe hoje no schema nem no código**
  (`grep` por "desconto"/"discount" não retornou nada). Ou seja: apesar do
  nome do repositório (`sql-item-discount-apportionment`), a funcionalidade de
  desconto/rateio entre itens **não está implementada no app atual**. Isso
  muda o escopo da seção "Totais e cálculos" do pedido original — não há
  rateio de desconto para testar porque a feature não existe. **Preciso que
  você confirme**: (a) é regra de negócio ainda não implementada (fora de
  escopo desta auditoria), ou (b) você esperava que eu a implementasse como
  parte do trabalho? Por ora vou tratar como "não se aplica" e focar nos
  totais que de fato existem (OS, itens, faturamento, relatórios).
- Todos os valores monetários já usam `Decimal(10,2)` do Postgres via Prisma
  (não `float`) — ponto positivo, vou confirmar que nenhum lugar do código
  converte para `number` de forma que perca precisão antes de persistir
  (`Number(...)` é usado em vários lugares só para exibição/soma em memória,
  o que é aceitável desde que a gravação em si continue em `Decimal`).

## 4. Riscos já identificados (sem alterar nada ainda)

1. **Sem staging/teste** — maior risco operacional para toda a auditoria (ver seção 0).
2. **RLS é defense-in-depth apenas**: a role do Prisma tem `BYPASSRLS` (documentado em `prisma/migrations/20260819100000_rls_branch_isolation/migration.sql`). Toda a autorização real do app depende de `lib/authz.ts`. Isso é uma decisão arquitetural já tomada e documentada — não é um bug, mas significa que qualquer rota de API que **esqueça** de chamar `requireAuth`/`assertBranchAccess` é um IDOR real sem rede de segurança do banco. Vou auditar rota por rota na Fase 2.
3. **`branches`/`user_branches` sem política de INSERT/UPDATE/DELETE** — intencional (só Prisma/admin provisiona), mas vale confirmar que nenhuma rota client-facing tenta escrever nessas tabelas via um cliente Supabase direto (só via Prisma).
4. **Sem staging**: código já foi corrigido/commitado direto em `master` em sessões anteriores (ex.: fix do gerador de código de OS, recorrência quinzenal) sem branch de PR — não há histórico de branches de feature. A branch `auditoria/qualidade-e-performance` será a primeira branch de trabalho isolada.
5. **Legado paralelo** (`src/`, `festaflow-desktop/`, `local-api/`, `functions/`, `database/sqlserver/`) pode conter código morto ou, pior, uma segunda fonte de verdade ativa em produção que eu ainda não confirmei. Preciso de confirmação sua antes de tratá-los como fora de escopo.
6. **`.env.local` de produção sentado no working directory** sem estar no git (correto), mas qualquer comando que eu rode nesse diretório (`npm run dev`, `prisma studio`, scripts) pode acidentalmente usar essas credenciais reais. Vou isolar isso com `.env.test` explícito e nunca herdar `.env.local` durante os testes.
7. **Sem testes automatizados hoje** — qualquer regressão futura (como os bugs de recorrência quinzenal e geração de código de OS corrigidos em sessões anteriores) só é pega manualmente. Prioridade real para a Fase 2.

## 5. Plano de testes (a executar após decisão sobre o ambiente de teste)

- **Linha de base**: `npm install`, `tsc --noEmit`, lint (verificar se há `eslint` configurado — a checar), `next build`, medição de tempo de `/api/dashboard`, `/api/orders`, `/api/reports/os` contra o seed.
- **Vitest** (unit/integração): `lib/order-total.ts`, `lib/billing.ts`, `lib/order-code.ts`, `lib/recurrence.ts`, `lib/client-dedupe*.ts`, `lib/authz.ts` (branch isolation, IDOR), validadores Zod.
- **Playwright** (E2E): login → cliente → OS → pagamento → reflexo no financeiro/dashboard; responsivo em 360px; estados de vazio/erro/carregamento.
- **Segurança**: revisão rota a rota de `app/api/**/route.ts` confirmando `requireAuth`/`requireModule`/`assertBranchAccess` em toda escrita e leitura; `npm audit`; grep por `NEXT_PUBLIC_` e uso de `SUPABASE_SECRET_KEY` fora de código server-only.
- **Performance**: procurar N+1 em `app/api/dashboard`, `app/api/reports/*` (múltiplos `findMany` sem `include` agregando em JS); confirmar paginação server-side em listagens; conferir índices existentes (já há vários criados em migrations recentes — checar se cobrem os filtros reais usados).

## Fase 1 — Linha de base (concluída em 2026-09-16)

- Branch de trabalho `auditoria/qualidade-e-performance` criada a partir de `master`.
- `npm install`: OK (585 pacotes).
- `npx tsc --noEmit`: **sem erros**.
- `npx next build`: **build de produção OK**, 39 rotas geradas, First Load JS ~103-203 kB por rota. Sem script de lint dedicado no `package.json` (Next roda seu passo interno de "Linting and checking validity of types" durante o build, sem config de ESLint própria no projeto — a confirmar na Fase 3 se vale adicionar).
- `npm audit`: 24 vulnerabilidades (2 críticas, 21 altas, 1 baixa). As que afetam dependências de **produção** diretamente:
  - `next@15.5.23` → corrigido em `15.5.24` (patch, sem breaking change) — 2 CVEs críticas (RCE não autenticado em servidor Windows; RCE na API de otimização de imagem AVIF). O deploy é na Vercel (Linux), então a primeira não se aplica ao ambiente atual, mas a segunda pode, se `next/image` com AVIF for usado — a verificar. Vou atualizar mesmo assim (patch simples).
  - `nodemailer@9.0.5` → corrigir para `>9.1.0` (mesma major) — usado em `lib/email.ts` para envio real de e-mail de OS.
  - Demais alertas (críticos/altos em `tar`, `js-yaml`, `electron`, `electron-builder`, etc.) são só de **devDependencies do empacotamento Electron/desktop** (`npm run dist`), não fazem parte do build/deploy web (`next build`) nem rodam em produção na Vercel. Vou registrar mas não deixar prioridade máxima, e não vou dar bump de major nelas sem necessidade.
  - Correção efetiva desses pacotes fica para a Fase 3 (Segurança), junto com o restante do checklist de segurança, para não misturar com a linha de base.
- **Ambiente de teste local montado**: Docker Desktop + `npx supabase start` (stack local completo: Postgres 17, Auth, Storage, Studio em `http://127.0.0.1:54323`). `.env.test` criado (git-ignorado — `.gitignore` raiz atualizado para cobrir `.env.test` além de `.env.*.local`, que não cobria esse nome). As 17 migrations do Prisma foram aplicadas com sucesso no banco local (`prisma migrate deploy`), confirmando que todas são válidas/aditivas.
- **Seed de teste** (`prisma/seed.test.ts`, roda só contra `127.0.0.1`/`localhost` — recusa rodar contra qualquer outra URL): 2 filiais fictícias, 3 usuários de Auth reais (admin/operador/funcionario, senha `TesteAudit123!`) com vínculos de filial cobrindo o cenário de admin global vs. acesso restrito, clientes PF e PJ (incluindo acentuação, caracteres especiais, e um caso de mesmo CPF com nomes diferentes na mesma filial — deve ser permitido pela regra de dedupe), funcionários, serviços (incluindo um de valor R$ 0,00), OS nos status agendado/realizado/realizado-mas-cancelado, lançamentos financeiros em 3 meses diferentes com centavos e pago/pendente, e recorrências semanal (multi-dia) e quinzenal.
- **Observação de escopo**: `ServiceOrderItem.quantity` é `Int` no schema — não existe quantidade fracionada no app hoje, então esse caso de teste do pedido original não se aplica (não é um bug, é uma limitação de schema que não foi pedida para mudar).
- Medição de tempo de páginas/consultas fica para o início da Fase 2, junto com a configuração do Playwright (login real via UI é o jeito correto de medir, em vez de simular sessão via curl).

## Próximos passos

Aguardando você decidir:
1. Qual das 3 opções da seção 0 usar para o banco de teste.
2. Confirmar se as pastas legadas (`src/`, `festaflow-desktop/`, `local-api/`, `functions/`, `database/sqlserver/`) estão realmente fora de uso.
3. Confirmar o entendimento sobre desconto/rateio (seção 3) não existir no app atual.

Só crio a branch `auditoria/qualidade-e-performance` e começo a Fase 1 depois do seu OK.
