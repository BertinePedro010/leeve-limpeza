import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const vitoria = await prisma.branch.upsert({
    where: { name: "Vitória" },
    update: {},
    create: { name: "Vitória", city: "Vitória", state: "ES" },
  });
  await prisma.branch.upsert({
    where: { name: "Cachoeiro" },
    update: {},
    create: { name: "Cachoeiro", city: "Cachoeiro de Itapemirim", state: "ES" },
  });

  const carlos = await prisma.client.upsert({
    where: { document: "123.456.789-00" },
    update: {},
    create: { branchId: vitoria.id, name: "Carlos Eduardo da Silva", email: "carlos.edu@gmail.com", phone: "(11) 98765-4321", document: "123.456.789-00", address: "Av. Paulista, 1000 - Sao Paulo - SP", notes: "Cliente premium." },
  });
  const mariana = await prisma.client.upsert({
    where: { document: "45.678.901/0001-23" },
    update: {},
    create: { branchId: vitoria.id, name: "Mariana Alencar Costa", email: "mariana@empresa.com.br", phone: "(11) 99888-7766", document: "45.678.901/0001-23", address: "Rua das Figueiras, 450 - Santo Andre - SP", notes: "Eventos corporativos frequentes." },
  });

  const ana = await prisma.employee.create({ data: { branchId: vitoria.id, name: "Ana Carolina Santos", role: "Decoradora", phone: "(11) 92222-3333", dailyRate: 350, paymentType: "diaria", notes: "Design floral e cenografia." } });
  const rodrigo = await prisma.employee.create({ data: { branchId: vitoria.id, name: "Rodrigo Vasconcelos", role: "Bartender", phone: "(11) 91111-2222", dailyRate: 250, paymentType: "diaria", notes: "Coqueteis premium." } });

  const decoracao = await prisma.service.create({ data: { branchId: vitoria.id, name: "Decoracao Tematica Completa", description: "Arranjos florais, painel decorativo e mobiliario.", price: 3500, durationHours: 12, category: "Decoracao", active: true } });
  const som = await prisma.service.create({ data: { branchId: vitoria.id, name: "Som e DJ", description: "DJ profissional, caixas ativas e microfones.", price: 1200, durationHours: 8, category: "Som e Iluminacao", active: true } });
  const garcons = await prisma.service.create({ data: { branchId: vitoria.id, name: "Servico de Garcons", description: "Equipe com 3 garcons treinados.", price: 540, durationHours: 6, category: "Servico de Apoio", active: true } });
  await prisma.service.create({ data: { branchId: vitoria.id, name: "Open Bar de Coqueteis", description: "Bar iluminado, bartenders e insumos.", price: 2500, durationHours: 6, category: "Bebidas", active: true } });

  const existing = await prisma.serviceOrder.findUnique({ where: { code: "OS-2026-0001" } });
  if (!existing) {
    const order = await prisma.serviceOrder.create({
      data: {
        branchId: vitoria.id,
        code: "OS-2026-0001",
        clientId: carlos.id,
        eventDate: new Date("2026-05-15T18:00:00-03:00"),
        startTime: "18:00",
        endTime: "23:59",
        location: "Espaco Jardins - Sao Paulo - SP",
        status: "confirmado",
        paymentMethod: "Pix 50/50",
        notes: "Montagem e passagem de som ate 15h.",
        signatureName: carlos.name,
        totalAmount: 5240,
        items: { create: [{ serviceId: decoracao.id, quantity: 1, unitPrice: 3500 }, { serviceId: som.id, quantity: 1, unitPrice: 1200 }, { serviceId: garcons.id, quantity: 1, unitPrice: 540 }] },
        employees: { create: [{ employeeId: ana.id }, { employeeId: rodrigo.id }] },
      },
    });
    await prisma.transaction.createMany({
      data: [
        { branchId: vitoria.id, type: "receita", category: "Eventos", description: "Entrada OS-2026-0001", amount: 2620, dueDate: new Date("2026-01-20"), paidAt: new Date("2026-01-20"), status: "pago", orderId: order.id },
        { branchId: vitoria.id, type: "despesa", category: "Marketing", description: "Trafego pago Instagram/Google Ads", amount: 600, dueDate: new Date("2026-05-01"), paidAt: new Date("2026-05-01"), status: "pago" },
      ],
    });
  }

  await prisma.serviceOrder.create({
    data: {
      branchId: vitoria.id,
      code: "OS-2026-0002",
      clientId: mariana.id,
      eventDate: new Date("2026-05-22T14:00:00-03:00"),
      startTime: "14:00",
      endTime: "22:00",
      location: "Rooftop Faria Lima - Sao Paulo - SP",
      status: "em_andamento",
      paymentMethod: "Faturamento 30 dias",
      notes: "Evento corporativo com controle de acesso.",
      totalAmount: 3040,
      items: { create: [{ serviceId: garcons.id, quantity: 1, unitPrice: 540 }] },
      employees: { create: [{ employeeId: rodrigo.id }] },
    },
  }).catch(() => undefined);
}

main().finally(async () => prisma.$disconnect());