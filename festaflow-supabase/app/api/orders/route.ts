import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { orderSchema } from "@/lib/validators";
import { fail, ok, serialize } from "@/lib/json";

async function nextCode() {
  const year = new Date().getFullYear();
  const count = await prisma.serviceOrder.count();
  return `OS-${year}-${String(count + 1).padStart(4, "0")}`;
}

function total(items: Array<{ quantity: number; unitPrice: number }>) {
  return items.reduce((sum, item) => sum + item.quantity * Number(item.unitPrice), 0);
}

const include = { client: true, items: { include: { service: true } }, employees: { include: { employee: true } }, attachments: true, transactions: true };

export async function GET() {
  await requireUser();
  const data = await prisma.serviceOrder.findMany({ where: { deletedAt: null }, orderBy: { eventDate: "asc" }, include });
  return ok(serialize(data));
}

export async function POST(request: Request) {
  await requireUser();
  const parsed = orderSchema.safeParse(await request.json());
  if (!parsed.success) return fail("OS invalida.", 422);
  const { items, employeeIds, ...body } = parsed.data;
  const data = await prisma.serviceOrder.create({
    data: {
      ...body,
      code: await nextCode(),
      totalAmount: total(items),
      items: { create: items },
      employees: { create: employeeIds.map((employeeId) => ({ employeeId })) },
    },
    include,
  });
  return ok(serialize(data), 201);
}
