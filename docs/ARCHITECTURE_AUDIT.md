# Auditoria de Arquitetura — FestaFlow

> Documento gerado em auditoria somente-leitura. Nenhum arquivo de código foi modificado para produzir esta análise.
> Data da auditoria: 2026-08-18

## Sumário executivo

Este repositório não contém **uma** aplicação, mas **quatro implementações paralelas e incompletas** do mesmo produto — um sistema de gestão de eventos/festas chamado **FestaFlow** (clientes, funcionários, serviços, ordens de serviço, calendário, financeiro, relatórios). Cada implementação escolheu uma stack de persistência diferente, e nenhuma delas está ligada às outras:

| # | Local | Stack | Banco | Autenticação | Estado |
|---|---|---|---|---|---|
| 1 | `src/` (raiz) + `desktop/` | React 19 + Vite 7 + Tailwind, empacotado em Electron | **Nenhum** — `localStorage` do navegador | Fake (login sem senha, simulado com `setTimeout`) | Protótipo de UI funcional, sem backend real |
| 2 | `functions/` + `firestore.rules` + `firestore.indexes.json` | Firebase Cloud Functions | Firestore (NoSQL) | — | Scaffold vazio, abandonado antes de qualquer implementação |
| 3 | `local-api/` + `database/sqlserver/` | Express + Prisma | **SQL Server** | JWT (jsonwebtoken + bcryptjs) | Scaffold/template não instalado (`package.template.json`) |
| 4 | `festaflow-desktop/` | Electron + Express (backend próprio) + React/Vite (frontend próprio) | **SQLite** via Prisma | JWT (jsonwebtoken + bcryptjs) | Funcional, mais completo, mas com arquivos Electron duplicados (`.cjs`/`.js`) |
| 5 | `festaflow-supabase/` | Next.js 15 (App Router) + React 19 | **PostgreSQL (Supabase)** via Prisma | Supabase Auth (`@supabase/ssr`, cookie-based) | **Implementação mais madura e recente** — CRUD completo via API routes |

A leitura mais provável do histórico do projeto é uma sequência de pivots de arquitetura:
**Firebase/Firestore** (abandonado cedo) → **SQL Server local via `local-api`** (scaffold não finalizado) → **`festaflow-desktop`** (Electron + SQLite, funcional) → **`festaflow-supabase`** (Next.js + Supabase/Postgres, a versão mais recente e completa).

O frontend na raiz do repositório (`src/`) nunca foi conectado a nenhum desses backends — permanece isolado, com dados fake em `localStorage`.

---

## 1. Qual é a aplicação principal deste repositório

Não há uma única "aplicação principal" ativa e canônica; há **cinco variantes coexistentes** do mesmo produto (tabela acima). Do ponto de vista de maturidade e completude de funcionalidades, **`festaflow-supabase/`** é a implementação mais avançada (CRUD completo, autenticação real via Supabase, banco Postgres gerenciado, App Router do Next.js). Do ponto de vista de "o que abre quando alguém roda `npm run dev` na raiz do repositório", é o app React/Vite mockado em `src/`.

O nome do produto em todas as variantes é **FestaFlow** — um sistema de gestão de eventos/festas (clientes, funcionários freelancer/diaristas, serviços contratáveis, ordens de serviço por evento, calendário de eventos, controle financeiro de receitas/despesas, relatórios).

## 2. Qual framework está sendo utilizado

Varia por subprojeto — não há um framework único:

- **Raiz (`src/`)**: React 19.2 + Vite 7 + Tailwind CSS 4, empacotado como app desktop via Electron (`desktop/`).
- **`festaflow-desktop/`**: frontend React/Vite próprio + backend Express 4 próprio, ambos empacotados juntos em um único app Electron.
- **`festaflow-supabase/`**: Next.js 15.1.3 (App Router) + React 19 + Tailwind 3.4, também empacotável em Electron (`output: "standalone"`).
- **`local-api/`**: Express + Prisma (scaffold, não é um app completo, é template de backend).
- **`functions/`**: Firebase Cloud Functions (Node.js) — vazio/boilerplate.

## 3. Como o frontend está estruturado

Existem **três frontends distintos e não relacionados entre si**:

1. **`src/` (raiz)** — React + Context API (`AppContext.tsx`) como única fonte de estado global; sem roteador (navegação por estado local de "view ativa" no `Sidebar`); componentes de página em `src/components/*View.tsx` (um por módulo: Clients, Employees, Services, OS, Calendar, Financial, Reports, Dashboard); estado persistido em `localStorage`.
2. **`festaflow-desktop/frontend/src/`** — React/Vite próprio, estrutura em `pages/` (ex.: `CalendarPage.tsx`), consumindo o backend Express do mesmo subprojeto via HTTP.
3. **`festaflow-supabase/components/SaasApp.tsx`** — um único componente client (~500 linhas) com toda a UI em abas (dashboard/clients/employees/services/orders/calendar/finance/reports), modais de CRUD, impressão de OS e exportação CSV do financeiro. Não reutiliza nada de `src/components/`.

Não há biblioteca de componentes/design system compartilhada entre as três — cada uma reimplementa sua própria UI.

## 4. Como o backend/API está estruturado

- **`src/` (raiz)**: **não tem backend**. Todas as operações são mutações diretas de estado em memória/`localStorage` via `AppContext`.
- **`festaflow-desktop/backend/`**: Express 4, estrutura clássica `routes/ → controllers/ → Prisma`, middlewares `helmet`/`cors`/`morgan`, rotas montadas em `/api/{auth,clients,employees,services,orders,transactions,reports}` + `/health`. Controllers são CRUDs finos, sem camada de service/repository.
- **`local-api/`**: mesmo padrão do `festaflow-desktop` (rotas idênticas: `auth`, `clients`, `employees`, `services`, `orders`, `transactions`, `reports`), mas é um **template/scaffold** (`package.template.json` precisa ser renomeado; documentado como "copie esta pasta e configure" em `README_LOCAL_EXECUTAVEL.md`).
- **`festaflow-supabase/app/api/`**: rotas do Next.js App Router (`route.ts` por recurso) — `clients`, `employees`, `services`, `orders`, `transactions`, `dashboard`. Cada rota chama `requireUser()` no início, valida entrada com Zod (`lib/validators.ts`) e serializa `Decimal`/`Date` via `lib/json.ts`.
- **`functions/`**: nenhuma function real exportada (exemplo padrão comentado).

## 5. Como funciona a autenticação atual

Quatro mecanismos diferentes, nenhum compartilhado:

- **`src/` (raiz)**: **fake**. `LoginView.tsx` aceita qualquer e-mail sem senha ("Não é necessária senha para testar") e um `role` escolhido manualmente. `AppContext.login()` simula latência com `setTimeout(600ms)` e cria um `User` local com id aleatório. `resetPassword` é só um toast simulado.
- **`festaflow-desktop/backend/`**: JWT stateless — `bcryptjs` para hash/verificação de senha, `jsonwebtoken` para assinar/verificar token (`utils/jwt.ts`), middleware `requireAuth` lê `Authorization: Bearer <token>`, `requireRole(...roles)` faz RBAC via enum `Role` (`ADMIN`/`OPERADOR`/`FUNCIONARIO`). Sem refresh token. `recoverPassword` é stub (não envia e-mail).
- **`local-api/`**: mesmo esquema JWT do `festaflow-desktop` (`middleware/auth.ts`), com nota de risco: fallback de secret `"dev-secret"` se a variável de ambiente não for definida.
- **`festaflow-supabase/`**: **Supabase Auth** real, via `@supabase/ssr` (cookie-based SSR, não localStorage/JWT manual). `lib/supabase/client.ts` (browser) e `lib/supabase/server.ts` (server). `middleware.ts` chama `supabase.auth.getUser()` em quase toda rota para refresh de sessão, mas **não bloqueia** rotas não autenticadas por si só — a proteção real é `requireUser()` (`lib/auth.ts`), chamado no topo da página protegida e em cada rota de API; sem usuário, redireciona para `/login`. Login/signup/reset de senha client-side via `supabase.auth.signInWithPassword/signUp/resetPasswordForEmail`. RBAC (`UserRole` no schema) existe no modelo `Profile` mas **não é verificado** em nenhuma rota do servidor.

## 6. Qual banco de dados está sendo utilizado atualmente

Não há um banco "atual" único — cada variante usa o seu:

| Variante | Banco | Via |
|---|---|---|
| `src/` (raiz) | Nenhum (localStorage do navegador) | — |
| Firebase (`functions/`, `firestore.*`) | Firestore (NoSQL) | SDK Firebase (não implementado) |
| `local-api/` + `database/sqlserver/` | SQL Server | Prisma (`provider = "sqlserver"`) |
| `festaflow-desktop/` | SQLite | Prisma (`provider = "sqlite"`, `file:./dev.db`) |
| `festaflow-supabase/` | **PostgreSQL gerenciado pelo Supabase** | Prisma (`provider = "postgresql"`, `DATABASE_URL`/`DIRECT_URL`) |

Se o objetivo for consolidar em um único banco de produção, `festaflow-supabase/` (Postgres via Supabase) é a variante mais próxima de um padrão de produção real, com migration inicial já aplicada (`prisma/migrations/20260101000000_init/`).

## 7. Quais são todos os modelos/entidades existentes

O modelo de dados é **conceitualmente o mesmo** nas três implementações com Prisma (`festaflow-desktop`, `local-api`, `festaflow-supabase`), mas com nomes de campos e detalhes divergentes (PT-BR vs EN, `Decimal` vs tipos primitivos, soft-delete presente só em uma delas). Consolidado:

- **User / Profile** — id, name/nome, email, passwordHash (exceto Supabase, que delega ao Supabase Auth), role (`ADMIN`/`OPERADOR`/`FUNCIONARIO`), createdAt
- **Client** — nome, email, telefone, documento (CPF/CNPJ, unique em `festaflow-supabase`), endereco, observacoes, createdAt (+ soft-delete em `festaflow-supabase`)
- **Employee** — nome, cargo, telefone, valorDiaria (Decimal), tipoPagamento (`diaria`/`salario`), observacoes
- **Service** — nome, descricao, valor (Decimal), duracaoHoras, categoria, status (`ativo`/`inativo`)
- **ServiceOrder (OS)** — codigo (`OS-{ano}-{seq}`, unique, gerado automaticamente), clienteId→Client, dataEvento, horarioInicio/Fim, local, status (enum `OSStatus`/`OsStatus`: pendente/confirmado/em_andamento/finalizado/cancelado), formaPagamento, observacoes, assinaturaNome/Data, anexos, valorTotal (calculado a partir dos itens)
- **ServiceOrderItem** — orderId→ServiceOrder (cascade), serviceId→Service, quantidade, valorUnitario
- **Employee↔ServiceOrder** — relação N:N (tabela de junção explícita `OrderEmployee` em `festaflow-supabase`; relação implícita nas outras)
- **Transaction** — tipo (receita/despesa), categoria, descricao, valor, data, status (pago/pendente), osId→ServiceOrder opcional (SetNull)
- **Attachment** — **só existe no schema de `festaflow-supabase`** (orderId, fileName, fileUrl, mimeType) — modelo criado mas **sem nenhuma rota de API que o use**
- **Notification** — só existe no tipo TypeScript do frontend raiz (`src/types/index.ts`), sem equivalente em nenhum backend Prisma

No frontend raiz (`src/types/index.ts`), os mesmos conceitos existem como tipos TypeScript puros, sem persistência real.

## 8. Como funcionam clientes

CRUD padrão (listar/criar/editar/excluir) em todas as variantes, campos: nome, email, telefone, documento, endereço, observações. Sem paginação, sem filtros de busca em nenhuma implementação. Em `festaflow-supabase`, `Client` tem soft-delete (`deletedAt`) e `documento` é unique; nas demais, exclusão é hard-delete.

## 9. Como funcionam funcionários

CRUD padrão: nome, cargo, telefone, valorDiaria, tipoPagamento (diária ou salário), observações. Relacionam-se com Ordens de Serviço via N:N (um funcionário pode ser alocado em várias OS, uma OS pode ter vários funcionários).

## 10. Como funcionam serviços

CRUD padrão: nome, descrição, valor, duração em horas, categoria, status (ativo/inativo). Cada `Service` é referenciado por `ServiceOrderItem`, formando o catálogo de itens que compõem uma Ordem de Serviço.

## 11. Como funcionam ordens de serviço

O módulo mais elaborado em todas as implementações com backend:
- Código sequencial gerado automaticamente no formato `OS-{ano}-{seq}`.
- `valorTotal` calculado a partir da soma dos itens (`ServiceOrderItem.quantidade × valorUnitario`).
- Relação N:N com funcionários alocados ao evento.
- Status com máquina de estados simples: pendente → confirmado → em_andamento → finalizado (ou cancelado).
- Campos de assinatura (nome/data) para registro de aceite do cliente.
- Anexos: campo existe no schema (JSON string em `festaflow-desktop`/`local-api`; modelo relacional dedicado `Attachment` em `festaflow-supabase`), mas **sem upload real de arquivo implementado** em nenhuma variante — não há storage (nem Supabase Storage, nem disco local) conectado.
- No `backend` de `festaflow-desktop`/`local-api`, update de itens é feito via `deleteMany` + `create` (recria todos os itens a cada edição, em vez de diff).

## 12. Como funciona o calendário

Em **nenhuma** das implementações existe um modelo ou rota de API dedicados a "calendário". O calendário é **sempre derivado no frontend** a partir de `ServiceOrder.dataEvento`:
- `src/components/CalendarView.tsx` lê das OS em memória/localStorage.
- `festaflow-desktop/frontend/src/pages/CalendarPage.tsx` consome `/api/orders` e agrupa por data no cliente.
- `festaflow-supabase` renderiza o calendário 100% client-side em `SaasApp.tsx`, a partir dos dados já carregados de `/api/orders`.

## 13. Como funciona o financeiro

Modelo `Transaction`: tipo (receita/despesa — string livre em `local-api`/`festaflow-desktop`, enum em `festaflow-supabase`), categoria, descrição, valor, data, status (pago/pendente), com vínculo opcional a uma Ordem de Serviço (`osId`, `SetNull` ao excluir a OS). CRUD simples em todas as variantes. `festaflow-supabase` acrescenta `dueDate`/`paidAt` para diferenciar vencimento de pagamento efetivo. Exportação CSV do financeiro existe apenas em `festaflow-supabase/components/SaasApp.tsx`.

## 14. Quais relatórios existem

Em todas as implementações com backend, há **um único endpoint agregado** (não relatórios individuais/parametrizáveis):
- `festaflow-desktop`: `reportsController.summary` — faturamento, despesas, lucro, contas a receber/pagar, contagens gerais.
- `local-api`: `GET /reports/summary` — mesma lógica.
- `festaflow-supabase`: `GET /api/dashboard` — mesmas agregações; **não há rota `/reports` própria** — a tela de relatórios (`ReportsView` dentro de `SaasApp.tsx`) reaproveita dados já carregados do dashboard/serviços/funcionários no cliente.
- `src/` (raiz): `ReportsView.tsx` calcula tudo em memória a partir do estado do `AppContext`, sem nenhum endpoint.

Não há relatórios com filtros de período, exportação em PDF, ou agregações por funcionário/serviço/cliente em nenhuma variante.

## 15. Quais integrações existem

- **Supabase** (Auth + Postgres gerenciado) — apenas em `festaflow-supabase/`.
- **Firebase** (Cloud Functions + Firestore) — scaffold inicial (`functions/`, `firestore.rules`, `firestore.indexes.json`), **nunca implementado de fato**: nenhuma function exportada, regras do Firestore ainda em "modo de teste" (`allow read, write: if true` até 2026-09-17), índices vazios.
- **Nenhuma** integração de pagamento, e-mail transacional, storage de arquivos, ou serviço externo de terceiros foi encontrada em nenhuma variante (o "envio de e-mail" de recuperação de senha é sempre um stub/simulação).
- Electron é usado como **empacotador desktop** (não é uma "integração" no sentido de serviço externo) em três lugares: `desktop/` (para `src/` raiz), `festaflow-desktop/electron/`, `festaflow-supabase/electron/`.

## 16. Quais partes do projeto são legadas

- **`functions/`, `firestore.rules`, `firestore.indexes.json`** — scaffold Firebase/Firestore abandonado antes de qualquer implementação real; nenhuma lógica de negócio.
- **`local-api/`** — scaffold/template de backend Express+Prisma+SQL Server nunca finalizado (`package.template.json` não renomeado); redundante com `festaflow-desktop/backend`, que implementa a mesma coisa de forma mais completa.
- **`database/sqlserver/schema.sql` + `seed.sql`** — versão T-SQL manual do mesmo modelo de dados, associada ao `local-api`; não gerada pelo Prisma, portanto pode divergir silenciosamente do schema Prisma ao longo do tempo.
- **`README_LOCAL_EXECUTAVEL.md`** — documenta a arquitetura SQL Server/Electron/local-api como caminho pretendido, mas essa direção parece ter sido abandonada em favor de `festaflow-desktop` (SQLite) e depois `festaflow-supabase` (Postgres/Supabase).
- **Arquivos Electron duplicados em `festaflow-desktop/electron/`** (`main.cjs` + `main.js`, `preload.cjs` + `preload.js`) — mesma lógica, aparentemente resíduo de uma reformatação/lint incompleta; `electron-builder.yml` empacota a pasta inteira, então ambos os pares vão para o build final.
- **`src/utils/mockData.ts` e toda a persistência em `localStorage`** — dados de demonstração, não uma fonte de dados real.
- **`index.html` da raiz** com título "Simulador de Rateio de Desconto NFC-e" — não bate com o nome do app FestaFlow renderizado em runtime; forte indício de que o projeto raiz nasceu de um starter template genérico reaproveitado (nome do repositório, `sql-item-discount-apportionment`, também reforça isso).
- **`src/components/DevSetupView.tsx`** — é apenas documentação estática embutida na UI (texto/guia com exemplo de schema Prisma para SQL Server), não implementação real.

## 17. Quais partes devem ser preservadas

(Recomendação, sujeita à confirmação do usuário antes de qualquer ação — nenhuma mudança foi feita.)

- **`festaflow-supabase/`** como base — é a implementação mais completa e mais próxima de um padrão de produção: Supabase Auth real, Postgres gerenciado, Prisma com migration inicial, API routes com validação Zod, soft-delete, RBAC modelado (mesmo que não totalmente aplicado).
- O **modelo de dados consolidado** (Client, Employee, Service, ServiceOrder, ServiceOrderItem, Transaction, e a relação N:N Employee↔ServiceOrder) — é consistente entre as três implementações Prisma e reflete os requisitos de negócio reais.
- A **UI/UX e fluxos de tela** do frontend raiz (`src/components/*View.tsx`) — mais rica visualmente e com mais componentes de apoio (ex.: view de impressão de OS) do que o único componente monolítico `SaasApp.tsx` de `festaflow-supabase`; pode valer a pena portar essas telas para consumir a API real do Supabase em vez de recriar a UI do zero.
- O **empacotamento Electron** (`festaflow-supabase/electron/` + `next.config.ts` com `output: "standalone"`) já está pronto para gerar um executável desktop a partir da versão Next.js/Supabase.

## 18. Quais partes precisam ser alteradas

(Recomendação, sujeita à confirmação do usuário antes de qualquer ação — nenhuma mudança foi feita.)

- **Decidir e formalizar uma única stack de backend/persistência.** Manter 4-5 implementações paralelas do mesmo domínio é o maior risco arquitetural do repositório — qualquer mudança de regra de negócio precisa ser replicada manualmente em várias bases de código já divergentes.
- **Conectar o frontend raiz (`src/`) a um backend real** ou descontinuá-lo em favor da UI de `festaflow-supabase` — hoje ele é 100% mock e pode gerar a falsa impressão de que a aplicação "funciona" sem nenhuma persistência real.
- **Remover ou arquivar explicitamente** os scaffolds abandonados (`functions/`, `firestore.*`, `local-api/`, `database/sqlserver/`) se a direção escolhida for `festaflow-supabase`, para evitar confusão futura sobre "qual é o backend certo".
- **Resolver a duplicação de arquivos Electron** em `festaflow-desktop/electron/` (`.cjs` vs `.js`).
- **Aplicar RBAC no servidor** em `festaflow-supabase` — o enum `UserRole` existe no schema `Profile`, mas nenhuma rota de API verifica o papel do usuário antes de autorizar a operação.
- **Implementar upload real de anexos** — o modelo `Attachment` existe em `festaflow-supabase/prisma/schema.prisma`, mas não há rota de API nem integração com Supabase Storage.
- **Revisar o `.env.local.example` de `festaflow-supabase`** — contém a URL/host real do projeto Supabase (`muyfhshqnazlyockmxmy.supabase.co`), mesmo com senha/chaves como placeholder. Recomenda-se confirmar com o time se esse identificador é de um projeto de produção e, em caso afirmativo, substituí-lo por um valor genérico de exemplo.
- **Padronizar nomenclatura de campos** (PT-BR vs EN) entre as implementações Prisma, caso uma futura consolidação precise migrar dados entre elas.
- **Regras do Firestore** (`allow read, write: if true` até 2026-09-17) — se o Firebase for definitivamente abandonado, remover o projeto/config; se for mantido por algum motivo, essa regra é insegura e não deve chegar a produção.

---

## Inventário de arquivos: Supabase, PostgreSQL e Prisma

### Supabase
- `festaflow-supabase/.env.local.example` — variáveis `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY`, `DATABASE_URL`, `DIRECT_URL`
- `festaflow-supabase/CONFIGURAR_ENV_LOCAL.md` — instruções de configuração
- `festaflow-supabase/middleware.ts` — refresh de sessão Supabase em quase todas as rotas
- `festaflow-supabase/lib/supabase/` — clients Supabase (browser e server, `@supabase/ssr`)
- `festaflow-supabase/lib/auth.ts` — `requireUser()`, ponte entre Supabase Auth e o restante da app
- `festaflow-supabase/components/LoginClient.tsx` — login/signup/reset via `supabase.auth.*`
- `festaflow-supabase/components/SaasApp.tsx` — chamada de logout via Supabase
- `festaflow-supabase/app/auth/callback/route.ts` — troca `code` → sessão Supabase
- `festaflow-supabase/package.json` — deps `@supabase/ssr`, `@supabase/supabase-js`

### PostgreSQL
- `festaflow-supabase/prisma/schema.prisma` — `datasource db { provider = "postgresql" }`
- `festaflow-supabase/prisma/migrations/20260101000000_init/migration.sql` — migration inicial (extensão `pgcrypto`, enums, tabelas)
- `festaflow-supabase/README.md` — confirma Postgres via Supabase como única persistência
- `festaflow-supabase/.env.local.example` — `DATABASE_URL`/`DIRECT_URL` apontando para instância Postgres do Supabase

### Prisma
- `festaflow-supabase/prisma/schema.prisma`, `festaflow-supabase/prisma/seed.ts`, `festaflow-supabase/lib/prisma.ts`
- `festaflow-supabase/app/api/**/route.ts` — todas as rotas usam o client Prisma
- `festaflow-supabase/package.json` — scripts `prisma:generate/migrate/dev/seed`, deps `@prisma/client`/`prisma`
- `festaflow-desktop/backend/prisma/schema.prisma` — `provider = "sqlite"`
- `festaflow-desktop/backend/package.json` — deps `@prisma/client`/`prisma`
- `local-api/prisma/schema.prisma` — `provider = "sqlserver"`
- `local-api/src/prisma.ts` — client Prisma do template

Nenhum arquivo relacionado a Supabase/Postgres/Prisma foi encontrado em `src/` (raiz) fora de uma menção estática (texto de documentação) em `src/components/DevSetupView.tsx`.

---

## Próximos passos

Este documento é apenas diagnóstico. Nenhuma alteração foi feita. Aguardando autorização para prosseguir com qualquer ação (ex.: consolidação de stack, remoção de scaffolds legados, conexão do frontend a um backend real, correções de segurança).

---

## Adendo de verificação (segunda passagem de auditoria, mesma data)

Reconferido lendo o conteúdo integral de `festaflow-supabase/prisma/schema.prisma`, `prisma/migrations/20260101000000_init/migration.sql`, `middleware.ts`, `lib/auth.ts`, `.env.local.example`, `package.json`, `app/api/clients/route.ts`, `app/api/orders/route.ts`, `functions/src/index.ts`, e checado `git rev-parse --is-inside-work-tree`. Todas as afirmações do documento acima se confirmaram. Três pontos adicionais, não cobertos acima:

1. **RLS já está habilitado, mas não protege nada hoje.** A migration inicial contém `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` para todas as 9 tabelas, com policies de leitura (`FOR SELECT USING (auth.role() = 'authenticated')`) — ou seja, qualquer usuário autenticado pode ler todas as linhas de todas as tabelas, sem nenhum isolamento por tenant/filial. Não existe **nenhuma policy de INSERT/UPDATE/DELETE**. Mais importante: `DATABASE_URL`/`DIRECT_URL` conectam o Prisma diretamente ao Postgres (não via PostgREST/`supabase-js` com JWT), então a conexão provavelmente usa o role `postgres` (ou um role com `BYPASSRLS`), o que faz o Postgres **ignorar RLS completamente** para todo o tráfego da aplicação. Resultado prático: RLS existe "no papel" mas não é a camada que protege os dados hoje — quem protege (fracamente) é só o `requireUser()` do lado do servidor, que verifica autenticação mas não autorização por papel/filial.
2. **Geração do código da OS tem race condition.** `app/api/orders/route.ts` gera `code` com `` `OS-${year}-${String(count + 1).padStart(4,"0")}` `` a partir de `prisma.serviceOrder.count()`. Duas requisições concorrentes de criação de OS podem ler a mesma contagem e gerar o mesmo código — não há constraint determinística nem transação serializável evitando a colisão (a unicidade de `code` no schema causaria erro 500 na segunda, não um retry automático).
3. **Não existe repositório Git em lugar nenhum desta pasta** (`git rev-parse --is-inside-work-tree` falha na raiz). Não há histórico de commits, branches, nem um ponto de rollback via Git. Qualquer estratégia de rollback para a migração precisa ser baseada em backup de arquivos/banco, não em Git, a menos que um repositório seja inicializado primeiro.

Nenhuma alteração de comportamento foi feita para produzir este adendo.
