# FestaFlow Desktop

Sistema local para gestao financeira e operacional de festas e eventos com frontend React, API Node/Express, banco SQLite via Prisma e Electron para gerar executavel Windows.

## Estrutura

```text
festaflow-desktop/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   ├── src/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── utils/
│   │   ├── app.ts
│   │   ├── prisma.ts
│   │   └── server.ts
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── contexts/
│   │   ├── hooks/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── types/
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── electron/
│   ├── main.cjs
│   ├── preload.cjs
│   └── electron-builder.yml
└── package.json
```

## Instalar

```bash
cd H:\Projetos\festaflow-desktop
npm install
npm run install:all
```

## Criar banco SQLite e dados iniciais

```bash
npm run db:push
npm run db:seed
```

Usuario inicial:

```text
Email: admin@festaflow.local
Senha: admin123
```

## Rodar em desenvolvimento

```bash
npm run dev
```

Frontend: http://localhost:5173

API: http://localhost:3333

## Build completo

```bash
npm run build
```

## Gerar executavel Windows

```bash
npm run dist
```

O instalador sera gerado em:

```text
release/
```
