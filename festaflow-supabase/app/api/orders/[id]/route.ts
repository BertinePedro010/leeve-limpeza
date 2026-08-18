import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { orderSchema } from "@/lib/validators";
import { fail, ok, serialize } from "@/lib/json";

function total(items: Array<{ quantity: number; unitPrice: number }>) {
  return items.reduce((sum, item) => sum + item.quantity * Number(item.unitPrice), 0);
}

const include = { client: true, items: { include: { service: true } }, employees: { include: { employee: true } }, attachments: true, transactions: true };

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const parsed = orderSchema.safeParse(await request.json());
  if (!parsed.success) return fail("OS invalida.", 422);
  const { items, employeeIds, ...body } = parsed.data;
  await prisma.$transaction([
    prisma.serviceOrderItem.deleteMany({ where: { orderId: id } }),
    prisma.orderEmployee.deleteMany({ where: { orderId: id } }),
  ]);
  const data = await prisma.serviceOrder.update({
    where: { id },
    data: {
      ...body,
      totalAmount: total(items),
      items: { create: items },
      employees: { create: employeeIds.map((employeeId) => ({ employeeId })) },
    },
    include,
  });
  return ok(serialize(data));
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  await prisma.serviceOrder.update({ where: { id }, data: { deletedAt: new Date() } });
  return ok({ success: true });
}
