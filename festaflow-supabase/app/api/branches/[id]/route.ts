import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireGlobalAdmin, handleAuthzError } from "@/lib/authz";
import { branchSchema } from "@/lib/validators";
import { fail, ok, serialize } from "@/lib/json";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    await requireGlobalAdmin(auth);
    const { id } = await params;
    const parsed = branchSchema.safeParse(await request.json());
    if (!parsed.success) return fail("Filial invalida.", 422);
    const data = await prisma.branch.update({ where: { id }, data: parsed.data });
    return ok(serialize(data));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return fail("Ja existe uma filial com esse nome.", 409);
    }
    return handleAuthzError(error);
  }
}
