# Relatório de Auditoria — LEVVE Limpeza (festaflow-supabase)

Branch: `auditoria/qualidade-e-performance` · Data: 2026-09-16

## 1. Resumo executivo

Auditoria completa do sistema web em produção (Next.js 15 + Prisma 6 +
Supabase), rodada inteiramente contra um **ambiente de teste local isolado**
(Supabase CLI via Docker) — nenhum comando tocou o banco de produção em
nenhum momento.

**Achado principal: o código já está em bom estado.** As sessões anteriores
(recorrência quinzenal, geração de código de OS) já corrigiram os bugs mais
graves conhecidos. Esta auditoria não encontrou nenhum problema crítico de
segurança, vazamento de dados entre filiais, ou cálculo financeiro incorreto
em produção. Os achados abaixo são reais, mas de severidade baixa/média —
principalmente lacunas de validação, dependências desatualizadas e ausência
de headers de segurança, todos já corrigidos nesta branch.

Também configurei do zero a infraestrutura de testes que não existia
(Vitest + Playwright). Estado final, tudo verde:
- `npx tsc --noEmit`: sem erros.
- `npm test` (Vitest): **56/56 testes unitários passando**.
- `npm run test:e2e` (Playwright, desktop + mobile 360px): **57/57 testes passando** (6 "skipped" são os testes de responsividade do projeto desktop, que rodam só no projeto mobile-360 de propósito).
- `npx next build`: build de produção OK.

## 2. Bugs e lacunas encontrados

| # | Descrição | Severidade | Onde | Correção | Teste que cobre |
|---|---|---|---|---|---|
| 1 | Nenhuma validação de formato/dígito verificador de CPF/CNPJ no servidor — qualquer string é aceita em `Client.document` | Médio | `lib/validators.ts` (`clientSchema`) | **Não corrigido** — registrado como decisão de negócio (seção 4) | `tests/unit/validators.test.ts` |
| 2 | `phone` do cliente não tem validação de formato nenhuma | Baixo | `lib/validators.ts` | **Não corrigido** — mesma decisão | `tests/unit/validators.test.ts` |
| 3 | `normalizeClientName` (regra de duplicidade) não remove acentos — "Joao" e "João" são tratados como nomes diferentes, permitindo recadastrar o mesmo CPF só variando a acentuação | Baixo | `lib/client-dedupe.ts` | **Não corrigido** — decisão de negócio (seção 4) | `tests/unit/pure-helpers.test.ts` |
| 4 | `next@15.5.23` com 2 CVEs (1 crítica de RCE em otimização de imagem AVIF, 1 crítica específica de servidor Windows — não aplicável à Vercel) | Alto (mitigado) | `package.json` | **Corrigido**: atualizado para `15.5.24` (patch) | `npm audit` |
| 5 | `nodemailer@9.0.5` com CVEs de DoS (complexidade quadrática no parser de endereço) e bypass de validação de domínio | Alto (mitigado) | `package.json` | **Corrigido**: atualizado para `9.1.1` (minor) | `npm audit` |
| 6 | Nenhum header de segurança (`X-Frame-Options`, `X-Content-Type-Options`, etc.) | Médio | `next.config.ts` | **Corrigido**: adicionados 4 headers básicos. CSP não incluído (exigiria revisão própria de nonces/inline styles) | manual + build |
| 7 | Nenhuma paginação server-side em nenhuma listagem (`clients`, `employees`, `orders`, `transactions`, `services`) | Médio (baixo impacto hoje) | `app/api/*/route.ts` | **Não corrigido** — volumes atuais são pequenos; registrado como recomendação (seção 6) | — |
| 8 | Vulnerabilidades altas/críticas restantes no `npm audit` são todas em dependências do empacotamento Electron/desktop (`electron`, `electron-builder`, `tar`, `js-yaml`, etc.) — não fazem parte do build/deploy web na Vercel | Informativo | `package.json` (devDependencies) | Não corrigido de propósito (fora do caminho de deploy; upgrade exigiria majors) | — |

## 3. Segurança

- **RLS**: todas as 14 tabelas têm Row Level Security habilitado. A conexão do Prisma usa uma role com `BYPASSRLS` (decisão arquitetural documentada na migration `20260819100000`) — a autorização real do app é 100% `lib/authz.ts`. RLS funciona como defesa em profundidade para qualquer acesso via PostgREST/Storage direto.
- **Autorização por rota**: confirmado que **as 38 rotas de API chamam `requireAuth()`**, sem exceção (varredura automatizada). Todas as rotas de escrita/leitura por id usam `assertRecordBranchAccess` (retorna 404, nunca 403, para não confirmar a existência de um registro de outra filial).
- **Testes de IDOR**: E2E confirmam que um `operador` restrito a uma filial recebe 404/403 ao tentar ler, editar ou excluir clientes/OS de outra filial, e 401 sem sessão.
- **Permissões por módulo**: `funcionario` (só módulo `calendar`) recebe 403 da API e não vê os itens de navegação de outros módulos; rotas exclusivas de admin global (`Filiais`, `Usuários`) só aparecem/funcionam para quem tem `user_branches` cobrindo todas as filiais ativas.
- **XSS**: nenhum uso de `dangerouslySetInnerHTML` no código. O e-mail de OS (HTML) escapa corretamente todo conteúdo vindo do banco (nome de cliente/serviço/observações) antes de interpolar.
- **Secrets**: `SUPABASE_SECRET_KEY` só é lido em código server-only; nenhuma chave de serviço aparece em componentes client. `.env.local`/`.env.test` corretamente fora do git.
- **`npm audit`**: ver tabela acima — as duas vulnerabilidades de dependências de produção foram corrigidas.

## 4. Itens que precisam da sua decisão

1. **Validação de CPF/CNPJ e telefone** (achados #1, #2): implementar checagem de dígito verificador/formato é uma mudança de regra de negócio (pode rejeitar dados hoje aceitos). Quer que eu implemente?
2. **Normalização de acentos no nome para dedupe** (achado #3): mudar `normalizeClientName` para remover acentos alteraria quais cadastros são considerados "duplicados" — decisão de regra de negócio, não implementada.
3. **Desconto/rateio de desconto**: confirmado na Fase 0 como fora de escopo (não existe essa funcionalidade no app hoje).
4. **Limite de 6 filiais**: já existe um trigger de banco (`migration 20260902140000`) que bloqueia a 7ª filial. Não é um bug — é uma decisão de negócio já implementada; só citando para você saber que está lá caso o cliente peça uma 7ª filial no futuro.

## 5. Melhorias de performance

O código já estava bem otimizado (provavelmente de sessões anteriores):
- Dashboard e relatórios já agregam no banco (`aggregate`, `$queryRaw` agrupado) em vez de trazer todas as linhas para somar em JavaScript.
- Nenhum padrão N+1 encontrado nas rotas revisadas (`orders`, `dashboard`, `reports/clients`, `transactions`, `employees`).
- Índices já cobrem os filtros/ordenações reais usados pelas rotas (várias migrations recentes dedicadas a isso).
- `nextOrderCode()` já foi corrigido (sessão anterior, commit `d7aafc1`) para não escalar linearmente com o número de filiais.

**Não corrigido nesta auditoria** (recomendação para quando o volume de dados crescer): nenhuma listagem tem paginação server-side (`take`/`skip`). Nos volumes atuais (dezenas/poucas centenas de registros por filial) isso não é um problema prático, mas deve ser adicionado antes que o número de clientes/OS por filial cresça significativamente.

## 5.1 Migrations criadas

**Nenhuma.** Não foi necessário criar nenhuma migration de banco nesta
auditoria — as 17 migrations existentes já cobrem os índices e constraints
relevantes, e nenhum ajuste de schema (aditivo ou não) foi identificado como
necessário. Todas as correções desta branch são em código de aplicação,
configuração (`next.config.ts`, `supabase/config.toml`) e testes.

## 6. Testes criados

- **Vitest** (`tests/unit/*.test.ts`, 56 testes): `order-total.ts`, `billing.ts` (sumRevenue), `order-status.ts`, `client-address.ts`/`order-address.ts`, `client-dedupe.ts`, `order-code.ts` (incluindo o cenário exato do bug de unicidade global corrigido na sessão anterior), `recurrence.ts` (semanal multi-dia, quinzenal, mensal com interval>1 e clamping de dia do mês), `validators.ts` (schemas Zod).
- **Playwright** (`tests/e2e/*.spec.ts`, 57 testes): autenticação/rotas protegidas/logout/sessão expirada, IDOR entre filiais, permissões por módulo, CRUD completo de clientes com validações e busca, consistência de totais do dashboard vs. banco (incluindo OS cancelada e transação pendente), responsividade em 360px, estado de erro de API.
- Ambiente: `.env.test` (git-ignorado) + `prisma/seed.test.ts`, isolados da produção por uma trava em runtime que recusa rodar contra qualquer host que não seja `127.0.0.1`/`localhost`.

### Nota técnica: sessão do Supabase Auth local e a suíte E2E

Durante a configuração, a suíte inteira rodando em sequência apresentava
falhas em cascata (dezenas de testes) que não reproduziam ao rodar cada
arquivo isoladamente — nada a ver com a aplicação. Causa raiz encontrada:
o teste de **logout** reaproveitava o mesmo `storageState` (sessão salva)
que outros arquivos de teste também usam; `signOut()` revoga essa sessão
*no servidor*, então qualquer teste que rodasse depois dele e reusasse o
mesmo arquivo de sessão congelada falhava com 401/redirecionamento,
mesmo sem nenhum problema real na aplicação. Corrigido isolando o teste de
logout com login próprio e descartável (`tests/e2e/auth.spec.ts`). Também
foram aumentados os rate limits do Auth local (`supabase/config.toml`,
`token_refresh` e `sign_in_sign_ups`) — os padrões do CLI (150 e 30 a cada
5 min) são baixos demais para uma suíte de testes real, mesmo sem esse bug.
Nenhuma dessas mudanças afeta o projeto Supabase de produção.

## 7. Recomendações futuras

1. Adicionar paginação server-side antes que o volume de dados cresça.
2. Decidir sobre os itens da seção 4.
3. Considerar CSP (Content-Security-Policy) como projeto à parte — exige auditoria de estilos/scripts inline.
4. Configurar ESLint no projeto (hoje não há configuração própria, só o passo interno do Next).
5. Rodar `npm run test` e `npm run test:e2e` no CI a cada PR, agora que a infraestrutura existe.
