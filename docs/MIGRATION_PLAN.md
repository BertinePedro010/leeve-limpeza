# Plano de Migração — FestaFlow → produção multi-filial (Supabase/Postgres/Prisma)

> Documento de planejamento. Nenhuma alteração de código, schema ou dado foi feita para produzir este documento.
> Data: 2026-08-18. Baseado em `docs/ARCHITECTURE_AUDIT.md` (auditoria completa + adendo de verificação).

---

## 0. Conflito crítico — RESOLVIDO pelo usuário em 2026-08-18

Confirmado pelo usuário: Vitória e Cachoeiro são filiais físicas **reais** do negócio FestaFlow (eventos/festas). A moldura "empresa de limpeza" do prompt original era texto de template incorreto/desatualizado e **não** reflete o domínio real. Decisão explícita: manter FestaFlow e seu domínio de eventos/festas integralmente — nenhuma renomeação da aplicação, nenhum redesenho de domínio em torno de limpeza. A aplicação de produção a evoluir é confirmada como `festaflow-supabase/`.

Consequência prática: todo o restante deste documento (arquitetura de isolamento multi-filial — `branches`, `branch_id`, RLS, `user_branches`) se aplica **sem nenhuma mudança de rótulo ou nomenclatura** — os campos e termos já usados no schema (`ServiceOrder`, `eventDate`, etc.) permanecem como estão. A única mudança de decisão é a da seção 4 abaixo (serviços também ficam por filial, não globais).

---

## 1. Arquitetura atual

Cinco implementações paralelas e desconectadas do mesmo produto (detalhe completo em `ARCHITECTURE_AUDIT.md`):

| # | Local | Stack | Estado |
|---|---|---|---|
| 1 | `src/` + `desktop/` | React 19 + Vite + Electron, `localStorage` | Protótipo de UI, sem backend |
| 2 | `functions/` + `firestore.*` | Firebase Functions + Firestore | Scaffold abandonado, vazio |
| 3 | `local-api/` + `database/sqlserver/` | Express + Prisma + SQL Server | Template não instalado |
| 4 | `festaflow-desktop/` | Electron + Express próprio + SQLite via Prisma | Funcional, mas isolado |
| 5 | `festaflow-supabase/` | Next.js 15 + Supabase Auth + Postgres via Prisma | **Mais madura — base desta migração** |

Nenhuma delas implementa filiais, multi-tenancy, RBAC efetivo no servidor, calendário como entidade própria, agendamento recorrente, upload real de anexos, envio de e-mail, ou audit log.

## 2. Arquitetura alvo

- **Aplicação única de produção**: `festaflow-supabase/` (Next.js App Router), evoluída — não recriada.
- **Persistência**: PostgreSQL gerenciado pelo Supabase, via Prisma (mantendo o padrão já em uso).
- **Autenticação**: Supabase Auth (mantida, já correta — `@supabase/ssr`, cookies SSR).
- **Autorização**: nova camada server-side explícita (`lib/authz.ts`) com `requireAuth`, `requireRole`, `requireBranchAccess`, checáveis em toda rota de API e em toda Server Action.
- **RLS**: reforçada e correta — policies por filial usando `auth.uid()` e uma tabela `user_branches`, cobrindo SELECT **e** INSERT/UPDATE/DELETE. Estratégia de conexão do Prisma revista (ver seção 8) para que RLS realmente se aplique, ou, alternativamente, mantida como defesa em profundidade enquanto a autorização real fica na API.
- **Storage**: Supabase Storage para anexos (modelo `Attachment` já existe, só falta a rota de upload).
- **E-mail**: abstração `EmailProvider` + tabela `email_logs`, disparado ao concluir uma OS.
- **Frontends legados** (`src/`, `festaflow-desktop/`, `local-api/`, `functions/`): não apagados nesta fase — arquivados/rotulados como obsoletos após confirmação (ver seção 15).

## 3. Mapeamento do banco atual → alvo

Tabelas atuais (`festaflow-supabase/prisma/schema.prisma`) e o que muda:

| Tabela atual | Ação | Detalhe |
|---|---|---|
| `profiles` | Alterar | usar tabela de junção `user_branches` em vez de coluna array (normalizado, conforme pedido) |
| `clients` | Alterar | + `branch_id` (nullable na migração, populado depois, `NOT NULL` só no fim) |
| `employees` | Alterar | + `branch_id NOT NULL` (funcionário pertence a uma filial) |
| `services` | Alterar | + `branch_id NOT NULL` (confirmado pelo usuário: serviços também são por filial) |
| `service_orders` | Alterar | + `branch_id NOT NULL`, + `created_by` |
| `service_order_items` | Sem mudança de schema | Herda filial via `service_orders` |
| `order_employees` | Sem mudança de schema | Herda filial via `service_orders` + valida cross-branch na aplicação |
| `attachments` | Sem mudança de schema | Herda filial via `service_orders`; + rota de upload real |
| `transactions` | Alterar | + `branch_id NOT NULL` (denormalizado a partir da OS para consulta rápida e para transações sem OS) |
| — | **Nova** | `branches` (id, name, city, state, active, timestamps) |
| — | **Nova** | `user_branches` (user_id, branch_id, created_at) |
| — | **Nova** | `appointments` (ver seção 10 — separa "ocorrência agendada" de "Ordem de Serviço") |
| — | **Nova** | `recurring_schedules` |
| — | **Nova** | `email_logs` |
| — | **Nova** | `audit_logs` |
| — | **Nova** | `site_bookings` |

## 4. Mudanças de schema necessárias (Prisma)

Decisões confirmadas pelo usuário em 2026-08-18:

- **Serviços são por filial.** `services` ganha `branch_id NOT NULL` — cada filial tem seu próprio catálogo, sem compartilhamento implícito entre Vitória e Cachoeiro.
- **Cliente pertence a exatamente uma filial.** `branch_id NOT NULL` direto em `clients` (sem tabela de junção `client_branches` — não há indicação de necessidade de cliente multi-filial; se isso mudar no futuro, é uma migração aditiva separada, não bloqueia esta fase).
- `Profile.role` já existe como enum (`admin`/`operador`/`funcionario`) — mapeia diretamente para `ADMIN`/`BRANCH_ADMIN`/`EMPLOYEE` do prompt. Mantidos os valores atuais do enum (não renomear) para não quebrar dados existentes; a tradução para `ADMIN`/`BRANCH_ADMIN`/`EMPLOYEE` acontece só na camada de autorização/UI (`operador` = `BRANCH_ADMIN`, `funcionario` = `EMPLOYEE`, `admin` = `ADMIN` com acesso a todas as filiais autorizadas em `user_branches`).

Novos models Prisma (nomes definitivos a confirmar, propostos abaixo):

```prisma
model Branch {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name      String   @db.VarChar(120)
  city      String   @db.VarChar(120)
  state     String   @db.VarChar(2)
  active    Boolean  @default(true)
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  @@map("branches")
}

model UserBranch {
  userId    String   @map("user_id") @db.Uuid
  branchId  String   @map("branch_id") @db.Uuid
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  branch    Branch   @relation(fields: [branchId], references: [id], onDelete: Cascade)
  @@id([userId, branchId])
  @@map("user_branches")
}

model Appointment {
  id            String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  orderId       String    @map("order_id") @db.Uuid
  branchId      String    @map("branch_id") @db.Uuid
  clientId      String    @map("client_id") @db.Uuid
  serviceId     String?   @map("service_id") @db.Uuid
  date          DateTime  @db.Date
  startTime     String    @map("start_time") @db.VarChar(10)
  endTime       String    @map("end_time") @db.VarChar(10)
  location      String?   @db.Text
  status        AppointmentStatus @default(scheduled)
  price         Decimal?  @db.Decimal(10, 2)
  notes         String?   @db.Text
  cancellationReason String? @map("cancellation_reason") @db.Text
  cancelledAt   DateTime? @map("cancelled_at") @db.Timestamptz(6)
  cancelledBy   String?   @map("cancelled_by") @db.Uuid
  completedAt   DateTime? @map("completed_at") @db.Timestamptz(6)
  recurringScheduleId String? @map("recurring_schedule_id") @db.Uuid
  createdAt     DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt     DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)
  order         ServiceOrder @relation(fields: [orderId], references: [id], onDelete: Cascade)
  @@index([branchId, date])
  @@index([orderId])
  @@index([status])
  @@map("appointments")
}

enum AppointmentStatus {
  scheduled
  confirmed
  in_progress
  completed
  cancelled
  no_show
}

model RecurringSchedule {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  clientId    String   @map("client_id") @db.Uuid
  orderId     String   @map("service_order_id") @db.Uuid
  branchId    String   @map("branch_id") @db.Uuid
  serviceId   String   @map("service_id") @db.Uuid
  frequency   RecurrenceFrequency
  interval    Int      @default(1)
  startDate   DateTime @map("start_date") @db.Date
  endDate     DateTime? @map("end_date") @db.Date
  dayOfWeek   Int?     @map("day_of_week")
  dayOfMonth  Int?     @map("day_of_month")
  startTime   String   @map("start_time") @db.VarChar(10)
  endTime     String   @map("end_time") @db.VarChar(10)
  price       Decimal  @db.Decimal(10, 2)
  active      Boolean  @default(true)
  createdBy   String   @map("created_by") @db.Uuid
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  @@index([branchId])
  @@index([active])
  @@map("recurring_schedules")
}

enum RecurrenceFrequency {
  weekly
  biweekly
  monthly
}

model EmailLog {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  type          String   @db.VarChar(60)
  recipient     String   @db.VarChar(180)
  subject       String   @db.VarChar(220)
  orderId       String?  @map("service_order_id") @db.Uuid
  appointmentId String?  @map("appointment_id") @db.Uuid
  status        String   @db.VarChar(30)
  provider      String   @db.VarChar(60)
  attempts      Int      @default(0)
  error         String?  @db.Text
  sentAt        DateTime? @map("sent_at") @db.Timestamptz(6)
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  @@map("email_logs")
}

model AuditLog {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  actorId    String?  @map("actor_id") @db.Uuid
  action     String   @db.VarChar(80)
  entityType String   @map("entity_type") @db.VarChar(60)
  entityId   String?  @map("entity_id") @db.Uuid
  branchId   String?  @map("branch_id") @db.Uuid
  metadata   Json?
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  @@index([entityType, entityId])
  @@index([branchId])
  @@map("audit_logs")
}

model SiteBooking {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  branchId  String?  @map("branch_id") @db.Uuid
  name      String   @db.VarChar(180)
  email     String?  @db.VarChar(180)
  phone     String?  @db.VarChar(40)
  message   String?  @db.Text
  status    String   @default("pending") @db.VarChar(30)
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  @@map("site_bookings")
}
```

Cada migration deve ser **aditiva e reversível**: adicionar coluna nullable → popular → só então tornar `NOT NULL`, nunca dropar coluna/tabela existente na mesma migration que adiciona o substituto.

## 5. Estratégia de autenticação

Manter **Supabase Auth** integralmente (já é a implementação correta, não precisa trocar). Mudanças:

- `middleware.ts` continua fazendo refresh de sessão (comportamento atual preservado).
- `requireUser()` (`lib/auth.ts`) permanece como está — verifica autenticação.
- **Nova função** `requireAuth()` = alias/wrapper de `requireUser()` para nomenclatura consistente com o prompt, sem duplicar lógica.
- Nenhuma senha customizada, nenhum JWT manual — os outros três esquemas de auth do repositório (`festaflow-desktop`, `local-api`, `src/`) não são portados.

## 6. Autorização (nova camada)

Criar `lib/authz.ts` com funções conceituais do prompt, implementadas sobre o `Profile` + `UserBranch` já existentes:

```
requireAuth()            // já existe como requireUser()
requireRole(...roles)    // lê profile.role, 403 se não bate
requireBranchAccess(branchId) // busca user_branches, 403 se não autorizado; ADMIN com acesso "todas as filiais" é bypass explícito, não implícito
canReadBranch(user, branchId)
canWriteBranch(user, branchId)
canManageEmployee(user, employee)
canManageAppointment(user, appointment)
canAccessFinancialData(user, branchId)
```

Toda rota de API (`app/api/**/route.ts`) e toda Server Action passa a chamar `requireAuth()` **e** `requireBranchAccess(branchId)` explicitamente — nunca confiar em `branch_id` vindo do corpo da requisição sem essa validação. Isso substitui o padrão atual (`await requireUser()` sem checagem de papel/filial) sem quebrar a assinatura das funções existentes — é uma adição, não uma reescrita.

## 7. Mudanças de API

Rotas atuais (`clients`, `employees`, `services`, `orders`, `transactions`, `dashboard`) são **preservadas e estendidas**, não recriadas:

- Cada rota `GET` passa a filtrar por `branch_id` do usuário autenticado (nunca por `branch_id` de query string sem validação).
- Cada rota `POST`/`PUT`/`DELETE` passa a validar `branch_id` do payload contra `requireBranchAccess`.
- Novas rotas: `/api/branches`, `/api/appointments`, `/api/recurring-schedules`, `/api/calendar`, `/api/reports` (hoje inexistente — reaproveita agregações do `/api/dashboard`), `/api/site-bookings`, `/api/audit`.
- `/api/orders` ganha sub-recursos para cancelamento/conclusão de **appointment individual**, sem afetar o restante da OS (ver seção 10).

## 8. Mudanças no Supabase

- Confirmar (via painel Supabase, não assumir) qual role a `DATABASE_URL`/`DIRECT_URL` usa. Se for `postgres` (superuser) ou tiver `BYPASSRLS`, RLS não protege o tráfego do Prisma hoje (achado do adendo de auditoria). Duas opções, a decidir com o usuário:
  1. **Manter Prisma com bypass e tratar RLS como defesa em profundidade** apenas para acesso direto via `supabase-js`/PostgREST (ex.: se o Storage ou alguma função client-side acessar o banco diretamente) — autorização real fica 100% na API Next.js (seção 6).
  2. **Trocar a connection string do Prisma** para um role sem bypass e fazer RLS ser a linha de defesa primária também para o Prisma — exige `SET request.jwt.claims` por conexão ou uma função Postgres que leia o usuário autenticado, mais invasivo.
  - Recomendação: opção 1 para esta migração (menor risco, não muda a forma como o Prisma conecta), com RLS corrigida mesmo assim como camada extra.
- Supabase Storage: criar bucket `attachments` (privado), política de leitura/escrita vinculada à filial da OS relacionada.
- Nenhuma chave `service_role` deve aparecer em código client-side — auditar `festaflow-supabase/components/*.tsx` antes de liberar Storage (upload direto do browser normalmente usa `anon` + policy, não `service_role`).

## 9. Mudanças no PostgreSQL / RLS

Substituir as policies atuais (`auth.role() = 'authenticated'`, somente SELECT) por policies reais por filial, usando `user_branches`:

```sql
CREATE POLICY "branch_read_clients" ON clients FOR SELECT
  USING (branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid()));

CREATE POLICY "branch_write_clients" ON clients FOR INSERT WITH CHECK (
  branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = auth.uid())
);
-- repetir para UPDATE/DELETE e para employees, services, service_orders, appointments, transactions, attachments
```

Padrão idêntico para **todas** as tabelas com `branch_id`, incluindo `services` (confirmado por filial, sem exceção global). `ADMIN` com acesso "todas as filiais" precisa de uma policy adicional (`OR profile.role = 'admin'` com subquery em `profiles`) — nunca inferir admin a partir de claim JWT sem checar o banco.

## 10. Mudanças no Prisma

- Client Prisma (`lib/prisma.ts`) não muda de forma.
- Toda query em rotas de API passa a incluir `where: { branchId }` como padrão, nunca opcional.
- Introduzir uma função utilitária `scopedPrisma(branchId)` ou equivalente que força o filtro em vez de depender de cada rota lembrar de aplicá-lo manualmente — reduz risco de esquecimento (é o tipo de bug que causaria vazamento entre filiais).
- `nextCode()` (geração de código da OS) precisa parar de usar `count()` e passar a usar uma sequência Postgres (`CREATE SEQUENCE`) ou uma transação `SERIALIZABLE`/`SELECT ... FOR UPDATE` sobre uma tabela de contador por ano+filial, para eliminar a race condition identificada no adendo de auditoria.

## 11. Estratégia de Row Level Security (resumo)

RLS habilitada em todas as tabelas com `branch_id`, policies para SELECT/INSERT/UPDATE/DELETE, sempre baseadas em `user_branches` + `auth.uid()`, nunca em valor enviado pelo cliente. RLS é tratada como **camada adicional**, não como substituta da autorização server-side da seção 6 — as duas devem concordar (testado explicitamente na seção 17, testes críticos 1, 2, 7, 8, 10 do prompt original).

## 12. Estratégia de isolamento por filial

Aplicada de forma idêntica em todas as entidades com `branch_id`:

1. Toda leitura filtra por filial(is) autorizada(s) do usuário — no servidor, nunca só no cliente.
2. Toda escrita valida `branch_id` do payload contra `requireBranchAccess`, nunca confia nele.
3. `appointments` herda `branch_id` da `service_order` pai no momento da criação (nunca aceito solto do cliente).
4. Funcionário só pode ser alocado (`order_employees`) em OS/appointment da mesma filial — validação server-side no endpoint de alocação.
5. Filial ativa no frontend é conveniência de UI (ex.: `localStorage` ou estado de contexto), nunca fonte de autorização — todo endpoint revalida.

## 13. Mudanças de agendamento (calendário, recorrência, appointments)

Hoje "calendário" não existe como entidade — é `ServiceOrder.eventDate` renderizado no cliente. Mudança estrutural:

- Nova tabela `appointments`: uma OS pode ter **múltiplos** appointments (hoje é 1:1 implícito via `eventDate`). Migração de dados: para cada `service_order` existente, criar um `appointment` inicial com os mesmos `eventDate`/`startTime`/`endTime`/`location`/`status`, preservando o histórico sem perda.
- Cancelamento de um appointment não cancela a OS inteira (nova regra — hoje não existe distinção, cancelar = mudar `status` da OS inteira para `cancelado`).
- `recurring_schedules` gera múltiplos `appointments` (ex.: mensal, todo dia 10) — geração deve ser **idempotente**: rodar o gerador duas vezes não duplica appointments (usar constraint única em `(recurring_schedule_id, date)` ou checar existência antes de criar).
- `/api/calendar` nova rota, já filtrando por filial no servidor — nunca carregar todos os appointments e filtrar no React (regra explícita do prompt original, e já um anti-padrão nas 3 implementações atuais que fazem exatamente isso).

## 14. Mudanças financeiras

- `transactions` ganha `branch_id` (denormalizado da OS, ou direto quando não vinculada a OS).
- Cancelamento de appointment **não** apaga transações históricas (`deletedAt`/soft-delete já existe no schema — reforçar que nenhuma rota faça hard-delete).
- Relatórios financeiros por filial usam o mesmo filtro server-side de `branch_id` — nenhuma agregação "global" sem checar `canAccessFinancialData`.

## 15. Mudanças de e-mail

Não existe hoje nenhum envio de e-mail real (o "recuperar senha" é sempre stub). Novo:

- `EmailProvider` como interface (`sendEmail(to, subject, body)`), implementação concreta via variável de ambiente (ex.: Resend/SendGrid — a decidir, nenhuma credencial hardcoded).
- Ao concluir uma OS (`status = finalizado` num appointment ou na OS inteira, a definir com o usuário), criar `email_logs` com `status = pending`, disparo assíncrono, atualizar `status`/`sentAt`/`error` após tentativa.

## 16. Mudanças de audit log

Nova tabela `audit_logs` (seção 4). Pontos de instrumentação: login, criação/edição de usuário, mudança de papel, mudança de acesso a filial, CRUD de cliente/funcionário/OS, criação/cancelamento/conclusão de appointment, mudanças financeiras, mudanças de configuração. Nunca logar segredos (senha, token, chave). Gravação via helper único (`logAudit(...)`) chamado nos mesmos pontos onde `requireBranchAccess` já é chamado — evita esquecimento.

## 17. Estratégia de testes

Frameworks: manter o que o `package.json` de `festaflow-supabase` já usa como base de tooling (TypeScript, sem framework de teste configurado ainda — precisa ser adicionado, ex. Vitest para unit/integration + Playwright para E2E).

Cobertura mínima antes de qualquer fase ser considerada concluída:
- CRUD de cada entidade (client, employee, service, order, appointment, recurring schedule).
- Os **10 testes de segurança críticos do prompt original**, literalmente: funcionário de uma filial acessando appointment/cliente de outra filial via API direta (não só via UI) deve falhar; troca de `branch_id` no corpo da requisição deve falhar; troca de URL/localStorage não deve contornar autorização; usuário não autenticado deve falhar; booking público não pode criar OS arbitrária.
- Geração de recorrência: idempotência (rodar duas vezes não duplica).
- Conflito de agenda de funcionário (dois appointments sobrepostos para o mesmo funcionário deve ser rejeitado no servidor).

## 18. Estratégia de rollback

**Não há Git neste diretório** (confirmado no adendo de auditoria) — a estratégia de rollback não pode assumir `git revert`. Recomendações, em ordem de prioridade:

1. **Inicializar um repositório Git antes de qualquer mudança de Fase 2** (`git init` + primeiro commit do estado atual) — isso não é opcional na prática, é o pré-requisito mínimo de segurança para qualquer trabalho incremental subsequente. Deve ser proposto como primeiro passo da Fase 2, com confirmação do usuário.
2. Migrations Prisma sempre aditivas (seção 4) — rollback de schema = `prisma migrate resolve` para a migration anterior + migration reversa explícita, nunca `DROP` direto em produção sem backup.
3. Backup do banco Supabase (dump `pg_dump` ou snapshot do painel Supabase) antes de cada migration em produção.
4. Cada fase de implementação (seção 19) termina em um commit isolado, permitindo reverter fase a fase.

## 19. Estratégia de deployment

- `festaflow-supabase/next.config.ts` já tem `output: "standalone"` e empacotamento Electron pronto — não precisa mudar a forma de build.
- Migrations aplicadas via `prisma migrate deploy` (já é o script de build atual — `npm run build` já roda `prisma generate && prisma migrate deploy`), preservado.
- Nenhuma mudança de plataforma de deploy é necessária para esta migração — o alvo já é a stack correta.

## 20. Estratégia de remoção de dependências

**Nenhuma remoção nesta fase.** Após a Fase 2 (schema + RLS + autorização) estar validada e aprovada:

- `functions/`, `firestore.rules`, `firestore.indexes.json`: arquivar (mover para `_archive/` ou remover do build, não do histórico) somente após confirmação explícita de que Firebase nunca será usado. Nenhuma dependência do Firebase Admin/Firestore SDK existe no `festaflow-supabase` — a remoção é isolada e não afeta o app alvo.
- `local-api/`, `database/sqlserver/`: mesma recomendação — scaffold nunca finalizado, seguro de arquivar isoladamente.
- `festaflow-desktop/`: decisão do usuário — é a única implementação alternativa **funcional** (SQLite); pode valer a pena preservar como referência ou desktop offline antes de decidir remover.
- `src/` (raiz): não remover sem decisão explícita — é a UI com mais componentes visuais; o plano recomenda portar telas dela para consumir a API do `festaflow-supabase` em vez de descartá-la (reaproveitar UI, trocar só a camada de dados).

## 21. Riscos

- **Vazamento de dados entre filiais** é o risco mais alto — mitigado por dupla camada (autorização server-side + RLS), testado explicitamente (seção 17).
- **RLS "fantasma"**: se a decisão da seção 8 não for revisitada, alguém pode assumir que RLS protege o Prisma quando não protege — documentar isso de forma visível no código (comentário no `schema.prisma` e em `lib/authz.ts`).
- **Sem Git**: qualquer mudança malfeita não tem rollback fácil até o `git init` da seção 18 acontecer.
- **Migração de dados existentes**: se já houver dados reais em produção no Supabase atual (o `.env.local.example` aponta para um projeto Supabase real, `muyfhshqnazlyockmxmy`), popular `branch_id` em registros existentes exige uma decisão de negócio (a qual filial pertence cada registro atual?) antes de tornar a coluna `NOT NULL` — não pode ser inferido automaticamente.
- **Nomenclatura de negócio** (seção 0): risco de retrabalho se a resposta sobre o domínio mudar depois da Fase 2 já implementada.

## 22. Ordem de implementação recomendada

1. `git init` + commit do estado atual (pré-requisito de segurança).
2. Confirmação do usuário sobre a questão da seção 0 (domínio de negócio) e sobre as decisões em aberto da seção 4 (serviços globais? clientes em múltiplas filiais?).
3. Schema: `branches`, `user_branches`, `branch_id` nullable nas tabelas existentes (migration aditiva).
4. Seed de `branches` (Vitória, Cachoeiro) + backfill manual/assistido de `branch_id` nos dados existentes.
5. `branch_id NOT NULL` (migration final, só após backfill confirmado).
6. Camada de autorização (`lib/authz.ts`) + aplicação em todas as rotas existentes.
7. RLS corrigida (policies reais por filial).
8. `appointments` + migração de dados de `service_orders` existentes para appointments.
9. `recurring_schedules` + gerador idempotente.
10. Calendário (`/api/calendar`) branch-aware, substituindo os cálculos client-side atuais.
11. Financeiro branch-aware.
12. Anexos via Supabase Storage.
13. E-mail + `email_logs`.
14. `audit_logs`.
15. `site_bookings` + endpoint público protegido.
16. Testes de segurança críticos (rodados continuamente desde o passo 6, não só no fim).
17. Decisão e execução da seção 20 (remoção/arquivamento de scaffolds legados).

## 23. Checkpoints de validação

Ao final de cada item da seção 22: `tsc --noEmit` limpo, lint limpo, testes verdes, build de produção (`npm run build`) sem erros, e — para os itens 6 a 16 especificamente — os 10 testes de segurança críticos rodando e passando antes de avançar para o próximo item. Nenhuma fase avança automaticamente para a próxima sem relatório explícito do que mudou e quais riscos permanecem, conforme a regra de execução incremental do prompt original.
