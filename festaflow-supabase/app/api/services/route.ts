import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { serviceSchema } from "@/lib/validators";
import { fail, ok, serialize } from "@/lib/json";

export async function GET() {
  await requireUser();
  const data = await prisma.service.findMany({ where: { deletedAt: null }, orderBy: [{ category: "asc" }, { name: "asc" }] });
  return ok(serialize(data));
}

export async function POST(request: Request) {
  await requireUser();
  const parsed = serviceSchema.safeParse(await request.json());
  if (!parsed.success) return fail("Servico invalido.", 422);
  const data = await prisma.service.create({ data: parsed.data });
  return ok(serialize(data), 201);
}
