import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireGlobalAdmin, handleAuthzError, AuthzError } from "@/lib/authz";
import { branchSchema } from "@/lib/validators";
import { fail, ok, serialize } from "@/lib/json";
import { MAX_BRANCHES, BRANCH_LIMIT_MESSAGE } from "@/lib/branch-limit";

// Chave arbitrária e fixa para pg_advisory_xact_lock: serializa criações de
// filial concorrentes nesta API para a contagem de limite abaixo não sofrer
// corrida. Precisa ser a mesma em todas as requisições (por isso constante).
const BRANCH_CREATE_LOCK_KEY = 748923001;

export async function GET() {
  try {
    const auth = await requireAuth();
    const data = await prisma.branch.findMany({
      where: { id: { in: auth.branchIds }, active: true },
      orderBy: { name: "asc" },
    });
    return ok(serialize(data));
  } catch (error) {
    return handleAuthzError(error);
  }
}

// Restricted to the global admin (role admin + access to every active
// branch) - a branch admin manages their own branch's data, not the list
// of branches itself.
export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    await requireGlobalAdmin(auth);
    const parsed = branchSchema.safeParse(await request.json());
    if (!parsed.success) return fail("Filial invalida.", 422);
    const data = await prisma.$transaction(async (tx) => {
      // Limite de 6 filiais, verificado no servidor antes do INSERT. O
      // advisory lock (liberado no fim da transação) serializa criações
      // concorrentes: uma segunda requisição simultânea só passa a contar
      // depois que a primeira commitou, então nunca chega a 7. O trigger
      // trg_enforce_branch_limit no banco é o backstop final para qualquer
      // INSERT fora desta rota.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${BRANCH_CREATE_LOCK_KEY})`;
      const total = await tx.branch.count();
      if (total >= MAX_BRANCHES) throw new AuthzError(BRANCH_LIMIT_MESSAGE, 409);

      const branch = await tx.branch.create({ data: parsed.data });
      // O trigger trg_link_global_admins_to_new_branch já vincula em
      // user_branches TODOS os admins globais atuais (inclusive quem está
      // criando). Este createMany é só uma garantia extra para o criador,
      // idempotente via skipDuplicates - acesso é sempre data-driven de
      // user_branches, nunca inferido do role.
      await tx.userBranch.createMany({ data: [{ userId: auth.userId, branchId: branch.id }], skipDuplicates: true });
      return branch;
    }, { timeout: 15000 });
    return ok(serialize(data), 201);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return fail("Ja existe uma filial com esse nome.", 409);
    }
    return handleAuthzError(error);
  }
}
