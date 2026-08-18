import bcrypt from "bcryptjs";
import { OSStatus, PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.user.upsert({
    where: { email: "admin@festaflow.local" },
    update: {},
    create: {
      name: "Administrador FestaFlow",
      email: "admin@festaflow.local",
      role: Role.ADMIN,
      passwordHash: await bcrypt.hash("admin123", 10),
    },
  });

  const carlos = await prisma.client.upsert({
    where: { id: "client-carlos" },
    update: {},
    create: { id: "client-carlos", nome: "Carlos Eduardo da Silva", email: "carlos.edu@gmail.com", telefone: "(11) 98765-4321", documento: "123.456.789-00", endereco: "Av. Paulista, 1000 - Sao Paulo - SP", observacoes: "Cliente premium." },
  });
  const mariana = await prisma.client.upsert({
    where: { id: "client-mariana" },
    update: {},
    create: { id: "client-mariana", nome: "Mariana Alencar Costa", email: "mariana@empresa.com.br", telefone: "(11) 99888-7766", documento: "45.678.901/0001-23", endereco: "Rua das Figueiras, 450 - Santo Andre - SP", observacoes: "Eventos corporativos frequentes." },
  });

  const ana = await prisma.employee.upsert({ where: { id: "emp-ana" }, update: {}, create: { id: "emp-ana", nome: "Ana Carolina Santos", cargo: "Decoradora", telefone: "(11) 92222-3333", valorDiaria: 350, tipoPagamento: "diaria", observacoes: "Design floral e cenografia." } });
  const rodrigo = await prisma.employee.upsert({ where: { id: "emp-rodrigo" }, update: {}, create: { id: "emp-rodrigo", nome: "Rodrigo Vasconcelos", cargo: "Bartender", telefone: "(11) 91111-2222", valorDiaria: 250, tipoPagamento: "diaria", observacoes: "Coqueteis premium." } });
  const daniel = await prisma.employee.upsert({ where: { id: "emp-daniel" }, update: {}, create: { id: "emp-daniel", nome: "Daniel Souza Lima", cargo: "DJ", telefone: "(11) 93333-4444", valorDiaria: 400, tipoPagamento: "diaria", observacoes: "Som e iluminacao." } });

  const decoracao = await prisma.service.upsert({ where: { id: "srv-decoracao" }, update: {}, create: { id: "srv-decoracao", nome: "Decoracao Tematica Completa", descricao: "Arranjos florais, painel decorativo e mobiliario.", valor: 3500, duracaoHoras: 12, categoria: "Decoracao", status: "ativo" } });
  const som = await prisma.service.upsert({ where: { id: "srv-som" }, update: {}, create: { id: "srv-som", nome: "Som e DJ", descricao: "DJ profissional, caixas ativas e microfones.", valor: 1200, duracaoHoras: 8, categoria: "Som e Iluminacao", status: "ativo" } });
  const garcons = await prisma.service.upsert({ where: { id: "srv-garcons" }, update: {}, create: { id: "srv-garcons", nome: "Servico de Garcons", descricao: "Equipe com 3 garcons treinados.", valor: 540, duracaoHoras: 6, categoria: "Servico de Apoio", status: "ativo" } });
  const bar = await prisma.service.upsert({ where: { id: "srv-bar" }, update: {}, create: { id: "srv-bar", nome: "Open Bar de Coqueteis", descricao: "Bar iluminado, bartenders e insumos.", valor: 2500, duracaoHoras: 6, categoria: "Bebidas", status: "ativo" } });

  const existing = await prisma.serviceOrder.findUnique({ where: { codigo: "OS-2026-0001" } });
  if (!existing) {
    const order = await prisma.serviceOrder.create({
      data: {
        codigo: "OS-2026-0001",
        clienteId: carlos.id,
        dataEvento: new Date("2026-05-15T18:00:00"),
        horarioInicio: "18:00",
        horarioFim: "23:59",
        local: "Espaco Jardins - Sao Paulo - SP",
        status: OSStatus.CONFIRMADO,
        formaPagamento: "Pix 50/50",
        observacoes: "Montagem e passagem de som ate 15h.",
        assinaturaNome: carlos.nome,
        anexos: "[]",
        valorTotal: 5240,
        funcionarios: { connect: [{ id: ana.id }, { id: daniel.id }] },
        itens: { create: [{ serviceId: decoracao.id, quantidade: 1, valorUnitario: 3500 }, { serviceId: som.id, quantidade: 1, valorUnitario: 1200 }, { serviceId: garcons.id, quantidade: 1, valorUnitario: 540 }] },
      },
    });

    await prisma.serviceOrder.create({
      data: {
        codigo: "OS-2026-0002",
        clienteId: mariana.id,
        dataEvento: new Date("2026-05-22T14:00:00"),
        horarioInicio: "14:00",
        horarioFim: "22:00",
        local: "Rooftop Faria Lima - Sao Paulo - SP",
        status: OSStatus.EM_ANDAMENTO,
        formaPagamento: "Faturamento 30 dias",
        observacoes: "Evento corporativo com controle de acesso.",
        anexos: "[]",
        valorTotal: 3040,
        funcionarios: { connect: [{ id: rodrigo.id }, { id: daniel.id }] },
        itens: { create: [{ serviceId: bar.id, quantidade: 1, valorUnitario: 2500 }, { serviceId: garcons.id, quantidade: 1, valorUnitario: 540 }] },
      },
    });

    await prisma.transaction.createMany({
      data: [
        { tipo: "receita", categoria: "Eventos", descricao: "Entrada OS-2026-0001", valor: 2620, data: new Date("2026-01-20"), status: "pago", osId: order.id },
        { tipo: "despesa", categoria: "Marketing", descricao: "Trafego pago Instagram/Google Ads", valor: 600, data: new Date("2026-05-01"), status: "pago" },
      ],
    });
  }
}

main().finally(async () => prisma.$disconnect());