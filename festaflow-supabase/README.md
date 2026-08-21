# LeeveLimpeza — Supabase PostgreSQL

Projeto Next.js + Prisma + Supabase Auth + Supabase PostgreSQL + Electron.

## Requisitos

- Node.js 20+
- Projeto Supabase ativo
- PostgreSQL do Supabase acessivel

## Configurar ambiente

Crie `.env.local` usando `.env.local.example`.

Use somente `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` no client.
Nunca use `SUPABASE_SECRET_KEY` em componentes client-side.

## Instalar

```bash
npm install
```

## Gerar Prisma Client

```bash
npm run prisma:generate
```

## Criar tabelas no Supabase por migrations

```bash
npm run prisma:migrate
```

## Desenvolvimento web

```bash
npm run dev
```

## Desenvolvimento Electron

```bash
npm run electron:dev
```

## Build de producao

```bash
npm run build
```

## Gerar instalador .exe

```bash
npm run dist
```

O instalador sera criado em `release/`.

## Persistencia

Toda persistencia do sistema acontece exclusivamente via Prisma no PostgreSQL do Supabase.

Nao ha SQLite, localStorage para dados de negocio, JSON database ou banco em memoria.