# FestaFlow Local API

API Node.js + Express + Prisma para usar o FestaFlow com SQL Server local.

## Endpoints principais

- `POST /api/auth/login`: login com JWT.
- `GET /api/clients`, `POST /api/clients`, `PUT /api/clients/:id`, `DELETE /api/clients/:id`.
- `GET /api/employees`, `POST /api/employees`, `PUT /api/employees/:id`, `DELETE /api/employees/:id`.
- `GET /api/services`, `POST /api/services`, `PUT /api/services/:id`, `DELETE /api/services/:id`.
- `GET /api/orders`, `POST /api/orders`, `PUT /api/orders/:id`, `DELETE /api/orders/:id`.
- `GET /api/transactions`, `POST /api/transactions`, `PUT /api/transactions/:id`, `DELETE /api/transactions/:id`.
- `GET /api/reports/summary`: resumo financeiro e operacional.

## Fluxo recomendado

1. Copie esta pasta para `backend/`.
2. Renomeie `package.template.json` para `package.json`.
3. Crie `.env` baseado em `.env.example`.
4. Execute `npm install`.
5. Execute `npx prisma generate`.
6. Execute `npx prisma db push`.
7. Execute `npm run dev`.

## Integracao com o frontend

Troque o `src/contexts/AppContext.tsx` para chamar `http://localhost:3333/api` usando `fetch` ou `axios`. Use o token retornado no login no header:

```http
Authorization: Bearer SEU_TOKEN
```