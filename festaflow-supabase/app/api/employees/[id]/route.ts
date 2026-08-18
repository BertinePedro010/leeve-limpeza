import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { employeeSchema } from "@/lib/validators";
import { fail, ok, serialize } from "@/lib/json";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const parsed = employeeSchema.safeParse(await request.json());
  if (!parsed.success) return fail("Funcionario invalido.", 422);
  const data = await prisma.employee.update({ where: { id }, data: parsed.data });
  return ok(serialize(data));
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  await prisma.employee.update({ where: { id }, data: { deletedAt: new Date() } });
  return ok({ success: true });
}
