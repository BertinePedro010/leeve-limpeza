import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { employeeSchema } from "@/lib/validators";
import { fail, ok, serialize } from "@/lib/json";

export async function GET() {
  await requireUser();
  const data = await prisma.employee.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } });
  return ok(serialize(data));
}

export async function POST(request: Request) {
  await requireUser();
  const parsed = employeeSchema.safeParse(await request.json());
  if (!parsed.success) return fail("Funcionario invalido.", 422);
  const data = await prisma.employee.create({ data: parsed.data });
  return ok(serialize(data), 201);
}
