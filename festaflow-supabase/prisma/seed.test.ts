// Seed fictício para o ambiente de teste local (Supabase CLI / Docker), NUNCA
// para produção. Roda contra as credenciais de .env.test (127.0.0.1) - ver
// AUDITORIA-PLANO.md. Cria filiais, usuários de auth (admin/operador/
// funcionario), clientes PF/PJ, funcionários, serviços, OS em vários status,
// recorrências e lançamentos financeiros em meses diferentes com centavos.
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} - run this against .env.test, not .env.local`);
  return value;
}

async function main() {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  if (!supabaseUrl.includes("127.0.0.1") && !supabaseUrl.includes("localhost")) {
    throw new Error(`Refusing to seed test auth users against non-local Supabase URL: ${supabaseUrl}`);
  }
  const admin = createClient(supabaseUrl, requireEnv("SUPABASE_SECRET_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const branchA = await prisma.branch.upsert({
    where: { name: "Filial Teste Norte" },
    update: {},
    create: { name: "Filial Teste Norte", city: "Vitória", state: "ES" },
  });
  const branchB = await prisma.branch.upsert({
    where: { name: "Filial Teste Sul" },
    update: {},
    create: { name: "Filial Teste Sul", city: "Cachoeiro de Itapemirim", state: "ES" },
  });

  async function ensureAuthUser(email: string, password: string) {
    const { data: list, error: listError } = await admin.auth.admin.listUsers();
    if (listError) throw listError;
    const found = list.users.find((u) => u.email === email);
    if (found) return found.id;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    return data.user.id;
  }

  const adminId = await ensureAuthUser("admin@teste.local", "TesteAudit123!");
  const operadorId = await ensureAuthUser("operador@teste.local", "TesteAudit123!");
  const funcionarioId = await ensureAuthUser("funcionario@teste.local", "TesteAudit123!");
  // Conta dedicada só para os testes E2E que fazem login real pela UI
  // (tests/e2e/auth.spec.ts). Um signInWithPassword novo para a MESMA conta
  // usada em outros specs (via tests/.auth/operador.json, gerado uma única
  // vez no global.setup.ts) invalida a sessão congelada nesse arquivo assim
  // que o Supabase Auth local emite uma nova - descoberto rodando a suíte
  // inteira e vendo clients-crud/idor falharem só depois que auth.spec.ts
  // logava de novo como "operador". Isolar a conta elimina a interferência.
  const authTestId = await ensureAuthUser("authtest@teste.local", "TesteAudit123!");

  const adminProfile = await prisma.profile.upsert({
    where: { id: adminId },
    update: {},
    create: { id: adminId, name: "Admin Teste", email: "admin@teste.local", role: "admin", allowedModules: [] },
  });
  const operadorProfile = await prisma.profile.upsert({
    where: { id: operadorId },
    update: {},
    create: { id: operadorId, name: "Operador Teste", email: "operador@teste.local", role: "operador", allowedModules: ["clients", "employees", "services", "orders", "calendar", "finance", "reports"] },
  });
  const funcionarioProfile = await prisma.profile.upsert({
    where: { id: funcionarioId },
    update: {},
    create: { id: funcionarioId, name: "Funcionario Teste", email: "funcionario@teste.local", role: "funcionario", allowedModules: ["calendar"] },
  });
  const authTestProfile = await prisma.profile.upsert({
    where: { id: authTestId },
    update: {},
    create: { id: authTestId, name: "Auth Test", email: "authtest@teste.local", role: "operador", allowedModules: ["clients", "employees", "services", "orders", "calendar", "finance", "reports"] },
  });

  // Admin com acesso a TODAS as filiais ativas (inclusive as 3 "legadas" que
  // já vêm inseridas pelas próprias migrations - ver migration
  // 20260902120000) para satisfazer de fato requireGlobalAdmin() em
  // lib/authz.ts; operador e funcionario só na filial A - cobre o cenário de
  // IDOR entre filiais (Fase 2).
  const allActiveBranches = await prisma.branch.findMany({ where: { active: true }, select: { id: true } });
  for (const { id: branchId } of allActiveBranches) {
    await prisma.userBranch.upsert({ where: { userId_branchId: { userId: adminProfile.id, branchId } }, update: {}, create: { userId: adminProfile.id, branchId } });
  }
  await prisma.userBranch.upsert({ where: { userId_branchId: { userId: operadorProfile.id, branchId: branchA.id } }, update: {}, create: { userId: operadorProfile.id, branchId: branchA.id } });
  await prisma.userBranch.upsert({ where: { userId_branchId: { userId: authTestProfile.id, branchId: branchA.id } }, update: {}, create: { userId: authTestProfile.id, branchId: branchA.id } });
  await prisma.userBranch.upsert({ where: { userId_branchId: { userId: funcionarioProfile.id, branchId: branchA.id } }, update: {}, create: { userId: funcionarioProfile.id, branchId: branchA.id } });

  // Clientes PF e PJ, incluindo acentos/caracteres especiais e um caso de
  // "mesmo documento, nomes diferentes" (regra de dedupe é por filial+nome).
  const clientePfA = await prisma.client.create({
    data: { branchId: branchA.id, name: "João da Silva Ção", email: "joao.silva@teste.local", phone: "(27) 99999-0001", document: "111.444.777-35", addressZip: "29010-000", addressStreet: "Rua das Acácias", addressNumber: "123", addressNeighborhood: "Centro", addressCity: "Vitória", addressState: "ES" },
  });
  const clientePjA = await prisma.client.create({
    data: { branchId: branchA.id, name: "Limpeza & Cia Serviços Ltda", email: "contato@limpezaecia.test", phone: "(27) 3333-0002", document: "11.222.333/0001-81", addressZip: "29010-100", addressStreet: "Av. Central", addressNumber: "500", addressNeighborhood: "Praia do Canto", addressCity: "Vitória", addressState: "ES" },
  });
  const clientePfB = await prisma.client.create({
    data: { branchId: branchB.id, name: "Maria Aparecida Núñez", email: "maria.nunez@teste.local", phone: "(28) 98888-0003", document: "222.333.444-05", addressZip: "29300-000", addressStreet: "Rua XV de Novembro", addressNumber: "77", addressNeighborhood: "Centro", addressCity: "Cachoeiro de Itapemirim", addressState: "ES" },
  });
  // Mesmo CPF que clientePfA, nome diferente, MESMA filial - deve ser permitido
  // (dedupe é por branch+documento+nome normalizado, não só por documento).
  const clienteDuplicadoDocumento = await prisma.client.create({
    data: { branchId: branchA.id, name: "João da Silva Ção Filho", email: "joao.filho@teste.local", phone: "(27) 99999-0099", document: "111.444.777-35", addressCity: "Vitória", addressState: "ES" },
  });

  const employeeA1 = await prisma.employee.create({ data: { branchId: branchA.id, name: "Carla Souza", role: "Faxineira", phone: "(27) 98888-1111", dailyRate: 180.5, paymentType: "diaria" } });
  const employeeA2 = await prisma.employee.create({ data: { branchId: branchA.id, name: "Pedro Lima", role: "Supervisor", phone: "(27) 98888-2222", dailyRate: 220, paymentType: "diaria" } });
  const employeeB1 = await prisma.employee.create({ data: { branchId: branchB.id, name: "Fernanda Alves", role: "Faxineira", phone: "(28) 97777-3333", dailyRate: 175.25, paymentType: "diaria" } });

  const servicoA1 = await prisma.service.create({ data: { branchId: branchA.id, name: "Limpeza Residencial Padrão", price: 189.9, durationHours: 4, category: "Residencial", active: true } });
  const servicoA2 = await prisma.service.create({ data: { branchId: branchA.id, name: "Limpeza Pós-Obra", price: 549.99, durationHours: 8, category: "Especializada", active: true } });
  const servicoA3Gratuito = await prisma.service.create({ data: { branchId: branchA.id, name: "Visita Técnica (cortesia)", price: 0, durationHours: 1, category: "Avaliação", active: true } });
  const servicoB1 = await prisma.service.create({ data: { branchId: branchB.id, name: "Limpeza Comercial", price: 349.5, durationHours: 6, category: "Comercial", active: true } });

  const now = new Date();
  const monthsAgo = (n: number, day: number) => new Date(now.getFullYear(), now.getMonth() - n, day, 14, 0, 0);

  // OS 1 - agendado, futura, filial A.
  const osAgendada = await prisma.serviceOrder.create({
    data: {
      branchId: branchA.id, code: "OS-TEST-0001", clientId: clientePfA.id,
      eventDate: new Date(now.getFullYear(), now.getMonth() + 1, 10, 9, 0, 0),
      startTime: "09:00", endTime: "13:00", location: "Rua das Acácias, 123 - Vitória - ES",
      status: "agendado", totalAmount: 189.9,
      items: { create: [{ serviceId: servicoA1.id, quantity: 1, unitPrice: 189.9 }] },
      employees: { create: [{ employeeId: employeeA1.id }] },
      createdBy: operadorProfile.id,
    },
  });

  // OS 2 - realizada no mês passado, com 2 itens, filial A -> deve virar
  // receita "paga" (mesma regra de lib/billing.ts, replicada manualmente
  // aqui porque o seed não passa pela API).
  const osRealizada = await prisma.serviceOrder.create({
    data: {
      branchId: branchA.id, code: "OS-TEST-0002", clientId: clientePjA.id,
      eventDate: monthsAgo(1, 5), startTime: "08:00", endTime: "16:00",
      location: "Av. Central, 500 - Vitória - ES", status: "realizado",
      totalAmount: 739.89,
      items: { create: [{ serviceId: servicoA1.id, quantity: 1, unitPrice: 189.9 }, { serviceId: servicoA2.id, quantity: 1, unitPrice: 549.99 }] },
      employees: { create: [{ employeeId: employeeA1.id }, { employeeId: employeeA2.id }] },
      createdBy: adminProfile.id,
    },
  });
  await prisma.transaction.create({
    data: { branchId: branchA.id, type: "receita", category: "Servicos", description: `OS ${osRealizada.code}`, amount: 739.89, dueDate: osRealizada.updatedAt, paidAt: monthsAgo(1, 5), status: "pago", orderId: osRealizada.id, isAutoRevenue: true },
  });

  // OS 3 - realizada e depois CANCELADA (mês retrasado) - não deve entrar em
  // nenhum total de receita, mesmo tendo status "realizado" internamente.
  const osCancelada = await prisma.serviceOrder.create({
    data: {
      branchId: branchA.id, code: "OS-TEST-0003", clientId: clienteDuplicadoDocumento.id,
      eventDate: monthsAgo(2, 20), startTime: "10:00", endTime: "12:00",
      location: "Rua das Acácias, 123 - Vitória - ES", status: "realizado",
      totalAmount: 189.9, cancelledAt: monthsAgo(2, 21), cancellationReason: "Cliente cancelou após execução (teste).",
      items: { create: [{ serviceId: servicoA1.id, quantity: 1, unitPrice: 189.9 }] },
    },
  });

  // OS 4 - valor zero (serviço de cortesia) - caso de borda para totais.
  await prisma.serviceOrder.create({
    data: {
      branchId: branchA.id, code: "OS-TEST-0004", clientId: clientePfA.id,
      eventDate: monthsAgo(0, 3), startTime: "15:00", endTime: "16:00",
      location: "Rua das Acácias, 123 - Vitória - ES", status: "realizado",
      totalAmount: 0,
      items: { create: [{ serviceId: servicoA3Gratuito.id, quantity: 1, unitPrice: 0 }] },
    },
  });

  // OS 5 - filial B, quantidade > 1 num item (quantidade é sempre inteira no
  // schema atual - ServiceOrderItem.quantity: Int - não existe quantidade
  // fracionada no app hoje).
  await prisma.serviceOrder.create({
    data: {
      branchId: branchB.id, code: "OS-TEST-0005", clientId: clientePfB.id,
      eventDate: monthsAgo(0, 8), startTime: "09:00", endTime: "15:00",
      location: "Rua XV de Novembro, 77 - Cachoeiro de Itapemirim - ES", status: "realizado",
      totalAmount: 699.0,
      items: { create: [{ serviceId: servicoB1.id, quantity: 2, unitPrice: 349.5 }] },
      employees: { create: [{ employeeId: employeeB1.id }] },
    },
  });
  await prisma.transaction.create({
    data: { branchId: branchB.id, type: "receita", category: "Servicos", description: "OS OS-TEST-0005", amount: 699.0, dueDate: monthsAgo(0, 8), paidAt: monthsAgo(0, 8), status: "pago", isAutoRevenue: false },
  });

  // Lançamentos financeiros manuais em meses diferentes, pago/pendente,
  // receita/despesa, com centavos - para bater dashboard x relatórios x banco.
  await prisma.transaction.createMany({
    data: [
      { branchId: branchA.id, type: "despesa", category: "Material de Limpeza", description: "Compra de insumos", amount: 312.47, dueDate: monthsAgo(2, 10), paidAt: monthsAgo(2, 10), status: "pago" },
      { branchId: branchA.id, type: "despesa", category: "Combustível", description: "Deslocamento equipe", amount: 145.0, dueDate: monthsAgo(1, 15), paidAt: null, status: "pendente" },
      { branchId: branchA.id, type: "receita", category: "Outros", description: "Venda de material excedente", amount: 50.0, dueDate: monthsAgo(0, 1), paidAt: monthsAgo(0, 1), status: "pago" },
      { branchId: branchB.id, type: "despesa", category: "Uniformes", description: "Compra de uniformes", amount: 890.3, dueDate: monthsAgo(1, 1), paidAt: monthsAgo(1, 2), status: "pago" },
      { branchId: branchB.id, type: "receita", category: "Servicos", description: "Lançamento pendente (não deve contar como receita realizada)", amount: 400.0, dueDate: monthsAgo(0, 20), paidAt: null, status: "pendente" },
    ],
  });

  // Recorrência semanal com múltiplos dias e uma quinzenal (feature recente -
  // ver memória ordercode-global-uniqueness-bug / client-dedupe-and-oscode).
  const osParaRecorrenciaSemanal = await prisma.serviceOrder.create({
    data: {
      branchId: branchA.id, code: "OS-TEST-0006", clientId: clientePfA.id,
      eventDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 9, 0, 0),
      startTime: "09:00", endTime: "11:00", location: "Rua das Acácias, 123 - Vitória - ES",
      status: "agendado", totalAmount: 189.9,
      items: { create: [{ serviceId: servicoA1.id, quantity: 1, unitPrice: 189.9 }] },
    },
  });
  const recSemanal = await prisma.recurringSchedule.create({
    data: {
      orderId: osParaRecorrenciaSemanal.id, branchId: branchA.id, clientId: clientePfA.id, serviceId: servicoA1.id,
      frequency: "weekly", daysOfWeek: [1, 3, 5], startTime: "09:00", endTime: "11:00", price: 189.9,
      startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate()), createdBy: adminProfile.id,
    },
  });
  for (let i = 0; i < 3; i++) {
    await prisma.appointment.create({
      data: { orderId: osParaRecorrenciaSemanal.id, branchId: branchA.id, employeeId: employeeA1.id, date: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7 * (i + 1)), startTime: "09:00", endTime: "11:00", status: "agendado", recurringScheduleId: recSemanal.id },
    });
  }

  const osParaRecorrenciaQuinzenal = await prisma.serviceOrder.create({
    data: {
      branchId: branchB.id, code: "OS-TEST-0007", clientId: clientePfB.id,
      eventDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3, 9, 0, 0),
      startTime: "09:00", endTime: "12:00", location: "Rua XV de Novembro, 77 - Cachoeiro de Itapemirim - ES",
      status: "agendado", totalAmount: 349.5,
      items: { create: [{ serviceId: servicoB1.id, quantity: 1, unitPrice: 349.5 }] },
    },
  });
  await prisma.recurringSchedule.create({
    data: {
      orderId: osParaRecorrenciaQuinzenal.id, branchId: branchB.id, clientId: clientePfB.id, serviceId: servicoB1.id,
      frequency: "biweekly", daysOfWeek: [2], startTime: "09:00", endTime: "12:00", price: 349.5,
      startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate()), createdBy: adminProfile.id,
    },
  });

  console.log("Seed de teste concluído:", {
    branches: [branchA.name, branchB.name],
    users: { admin: "admin@teste.local", operador: "operador@teste.local", funcionario: "funcionario@teste.local", senha: "TesteAudit123!" },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
