import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { clientSchema } from "@/lib/validators";
import { fail, ok, serialize } from "@/lib/json";

export async function GET() {
  await requireUser();
  const data = await prisma.client.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, include: { orders: true } });
  return ok(serialize(data));
}

export async function POST(request: Request) {
  await requireUser();
  const parsed = clientSchema.safeParse(await request.json());
  if (!parsed.success) return fail("Cliente invalido.", 422);
  const data = await prisma.client.create({ data: parsed.data });
  return ok(serialize(data), 201);
}
