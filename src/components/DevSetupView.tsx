import React from "react";
import { Terminal, Database, ShieldAlert, Cpu, HardDrive, Globe } from "lucide-react";

export const DevSetupView: React.FC = () => {
  const prismaSchema = `// prisma/schema.prisma

datasource db {
  provider = "sqlserver"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

enum Role {
  ADMIN
  OPERADOR
  FUNCIONARIO
}

enum OSStatus {
  PENDENTE
  CONFIRMADO
  EM_ANDAMENTO
  FINALIZADO
  CANCELADO
}

model User {
  id        String   @id @default(uuid())
  email     String   @unique
  password  String
  name      String
  role      Role     @default(OPERADOR)
  createdAt DateTime @default(now())
}

model Client {
  id          String         @id @default(uuid())
  nome        String
  email       String         @unique
  telefone    String
  documento   String         @unique
  endereco    String
  observacoes String?
  createdAt   DateTime       @default(now())
  orders      ServiceOrder[]
}

model Employee {
  id            String         @id @default(uuid())
  nome          String
  cargo         String
  telefone      String
  valorDiaria   Decimal        @db.Decimal(10, 2)
  tipoPagamento String
  observacoes   String?
  createdAt     DateTime       @default(now())
  orders        ServiceOrder[] @relation("EmployeeOrders")
}

model Service {
  id           String             @id @default(uuid())
  nome         String
  descricao    String
  valor        Decimal            @db.Decimal(10, 2)
  duracaoHoras Decimal            @db.Decimal(5, 2)
  categoria    String
  status       String             @default("ativo")
  items        ServiceOrderItem[]
}

model ServiceOrder {
  id             String             @id @default(uuid())
  codigo         String             @unique
  clienteId      String
  cliente        Client             @relation(fields: [clienteId], references: [id])
  dataEvento     DateTime
  horarioInicio  String
  horarioFim     String
  local          String
  status         OSStatus           @default(PENDENTE)
  formaPagamento String
  observacoes    String?
  assinaturaNome String?
  assinaturaData DateTime?
  anexos         String?            @db.NVarChar(Max)
  valorTotal     Decimal            @db.Decimal(10, 2)
  createdAt      DateTime           @default(now())
  itens          ServiceOrderItem[]
  funcionarios   Employee[]         @relation("EmployeeOrders")
}

model ServiceOrderItem {
  id            String       @id @default(uuid())
  orderId       String
  order         ServiceOrder @relation(fields: [orderId], references: [id], onDelete: Cascade)
  serviceId     String
  service       Service      @relation(fields: [serviceId], references: [id])
  quantidade    Int
  valorUnitario Decimal      @db.Decimal(10, 2)
}
`;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">Guia de Produção & Arquitetura</h2>
        <p className="text-xs text-slate-500">Documentação para rodar localmente com SQL Server e empacotar como executável desktop.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Run guidelines */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
          <div className="flex items-center gap-2">
            <Terminal className="h-5 w-5 text-indigo-500" />
          <h3 className="text-sm font-bold text-slate-800">1. Como Rodar Localmente e Gerar Executável</h3>
          </div>

          <div className="space-y-4 text-xs text-slate-600">
            <div>
              <h4 className="font-bold text-slate-700">Estrutura de Pastas Recomendada</h4>
              <pre className="mt-2 bg-slate-50 p-3.5 rounded-xl font-mono text-[11px] leading-relaxed overflow-x-auto text-slate-700 border border-slate-100">
{`festaflow-root/
├── local-api/ (NodeJS + Express + Prisma + SQL Server)
│   ├── src/
│   │   ├── middleware/
│   │   └── routes/
│   ├── prisma/
│   │   └── schema.prisma
│   ├── package.template.json
│   └── .env
├── desktop/ (Electron para gerar .exe)
├── database/sqlserver/ (schema.sql e seed.sql)
└── src/ (React + Vite + Tailwind)`}
              </pre>
            </div>

            <div>
              <h4 className="font-bold text-slate-700">Comandos de Instalação e Execução</h4>
              <div className="mt-2 space-y-2 font-mono text-[11px] leading-relaxed">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <p className="text-slate-500 mb-1"># Inicializar SQL Server + Prisma</p>
                  <p className="font-bold text-indigo-700">cd local-api</p>
                  <p className="font-bold text-indigo-700">copy package.template.json package.json</p>
                  <p className="font-bold text-indigo-700">npm install</p>
                  <p className="font-bold text-indigo-700">npx prisma db push</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <p className="text-slate-500 mb-1"># Gerar app desktop Windows</p>
                  <p className="font-bold text-indigo-700">npm install -D electron electron-builder</p>
                  <p className="font-bold text-indigo-700">npm run build</p>
                  <p className="font-bold text-indigo-700">electron-builder --config desktop/electron-builder.template.yml</p>
                </div>
              </div>
            </div>

            <div className="bg-indigo-50/50 p-4 border border-indigo-100 rounded-xl space-y-1.5">
              <h4 className="font-bold text-indigo-800 flex items-center gap-1.5">
                <Globe className="h-4 w-4" />
                Modo local + executável Windows
              </h4>
              <p className="text-[11px] leading-relaxed text-indigo-700">
                O projeto agora inclui guia para SQL Server local, API Express com Prisma e base Electron para gerar instalador <strong>.exe</strong>.
              </p>
            </div>
          </div>
        </div>

        {/* Database relational models (Prisma) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-indigo-500" />
            <h3 className="text-sm font-bold text-slate-800">2. Modelagem Relacional (Prisma schema)</h3>
          </div>

          <div className="relative">
            <pre className="bg-slate-900 text-slate-300 p-4 rounded-xl font-mono text-[11px] leading-relaxed overflow-x-auto max-h-[500px]">
              <code>{prismaSchema}</code>
            </pre>
          </div>
        </div>
      </div>

      {/* Tech Specifications */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm text-center space-y-1">
          <HardDrive className="h-5 w-5 text-slate-400 mx-auto" />
          <h4 className="text-xs font-bold text-slate-800">SQL Server Relacional</h4>
          <p className="text-[10px] text-slate-500">Consistência ACID completa para finanças, contratos e ordens de serviço.</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm text-center space-y-1">
          <Cpu className="h-5 w-5 text-slate-400 mx-auto" />
          <h4 className="text-xs font-bold text-slate-800">Controle JWT</h4>
          <p className="text-[10px] text-slate-500">Middleware com níveis de acesso admin, operador e funcionário.</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm text-center space-y-1">
          <ShieldAlert className="h-5 w-5 text-slate-400 mx-auto" />
          <h4 className="text-xs font-bold text-slate-800">Validação e Sanitização</h4>
          <p className="text-[10px] text-slate-500">Proteção robusta contra CSRF, XSS e SQL Injection.</p>
        </div>
      </div>
    </div>
  );
};
