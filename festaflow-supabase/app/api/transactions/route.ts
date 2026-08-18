import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { transactionSchema } from "@/lib/validators";
import { fail, ok, serialize } from "@/lib/json";

export async function GET() {
  await requireUser();
  const data = await prisma.transaction.findMany({ where: { deletedAt: null }, orderBy: { dueDate: "desc" }, include: { order: true } });
  return ok(serialize(data));
}

export async function POST(request: Request) {
  await requireUser();
  const parsed = transactionSchema.safeParse(await request.json());
  if (!parsed.success) return fail("Lancamento invalido.", 422);
  const data = await prisma.transaction.create({ data: parsed.data });
  return ok(serialize(data), 201);
}
