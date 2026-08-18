import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { serviceSchema } from "@/lib/validators";
import { fail, ok, serialize } from "@/lib/json";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const parsed = serviceSchema.safeParse(await request.json());
  if (!parsed.success) return fail("Servico invalido.", 422);
  const data = await prisma.service.update({ where: { id }, data: parsed.data });
  return ok(serialize(data));
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  await prisma.service.update({ where: { id }, data: { deletedAt: new Date() } });
  return ok({ success: true });
}