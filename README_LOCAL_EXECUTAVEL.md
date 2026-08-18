# FestaFlow local com banco SQL e executavel

Este arquivo explica como levar este projeto para a sua maquina, conectar em um banco SQL local e empacotar como aplicativo executavel para Windows.

## Resumo da arquitetura local

- Frontend: React + Vite + Tailwind, ja implementado em `src/`.
- API local: Node.js + Express + Prisma, modelo sugerido em `local-api/`.
- Banco local: SQL Server Express ou LocalDB, com schema em `database/sqlserver/schema.sql`.
- Executavel: Electron carregando o build do frontend e iniciando a API local.

## Requisitos na sua maquina

- Node.js 20 ou superior.
- SQL Server Express ou SQL Server LocalDB.
- SQL Server Management Studio ou Azure Data Studio.
- Git opcional.
- Windows 10/11 para gerar `.exe`.

## Como copiar este projeto

1. Copie a pasta inteira do projeto para sua maquina.
2. Abra o terminal dentro da pasta.
3. Rode `npm install`.
4. Rode `npm run build` para gerar a pasta `dist/`.

## Criar banco SQL local

No SQL Server Management Studio, execute:

```sql
CREATE DATABASE FestaFlowLocal;
GO
```

Depois execute o arquivo:

```text
database/sqlserver/schema.sql
```

Para inserir exemplos, execute:

```text
database/sqlserver/seed.sql
```

## String de conexao local

Exemplo para SQL Server Express:

```env
DATABASE_URL="sqlserver://localhost:1433;database=FestaFlowLocal;user=sa;password=SUA_SENHA;trustServerCertificate=true"
JWT_SECRET="troque-esta-chave-em-producao"
PORT=3333
```

Exemplo para LocalDB pode variar conforme o driver usado. Para uso profissional, SQL Server Express com usuario e senha e o caminho mais simples.

## API local

A pasta `local-api/` contem o desenho profissional do backend:

- `local-api/prisma/schema.prisma`: schema Prisma para SQL Server.
- `local-api/src/server.ts`: servidor Express.
- `local-api/src/prisma.ts`: client Prisma.
- `local-api/src/middleware/auth.ts`: middleware JWT e permissao.
- `local-api/src/routes/*.ts`: rotas REST para clientes, funcionarios, servicos, OS e financeiro.

Para transformar em API real na sua maquina:

1. Crie uma pasta `backend`.
2. Copie o conteudo de `local-api/` para `backend/`.
3. Crie um `package.json` conforme `local-api/package.template.json`.
4. Crie `.env` com a string `DATABASE_URL`.
5. Rode:

```bash
npm install
npx prisma generate
npx prisma db push
npm run dev
```

## Executavel Windows com Electron

A pasta `desktop/` contem os arquivos base para empacotar como app desktop:

- `desktop/main.cjs`: processo principal do Electron.
- `desktop/preload.cjs`: ponte segura entre app e sistema.
- `desktop/electron-builder.template.yml`: configuracao do instalador.

No seu ambiente local, instale as dependencias de desktop:

```bash
npm install -D electron electron-builder concurrently wait-on
```

Depois adicione scripts equivalentes no `package.json` local:

```json
{
  "main": "desktop/main.cjs",
  "scripts": {
    "build": "vite build",
    "desktop:dev": "concurrently \"npm run dev\" \"wait-on http://localhost:5173 && electron .\"",
    "desktop:pack": "npm run build && electron-builder --config desktop/electron-builder.template.yml"
  }
}
```

Gerar executavel:

```bash
npm run desktop:pack
```

O instalador ficara em:

```text
release/
```

## Observacao importante

Este frontend atual ainda usa `localStorage` como persistencia de demonstracao. Para gravar tudo no SQL Server, substitua as funcoes do `src/contexts/AppContext.tsx` por chamadas HTTP para a API local (`http://localhost:3333/api`). O contrato de endpoints esta documentado em `local-api/README.md`.

## Proximo passo recomendado

Se voce quiser, eu posso fazer a proxima etapa: trocar o `AppContext` inteiro para consumir a API local e deixar o frontend salvando clientes, funcionarios, servicos, OS e financeiro diretamente no SQL Server.