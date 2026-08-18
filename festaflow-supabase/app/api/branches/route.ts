import { prisma } from "@/lib/prisma";
import { requireAuth, handleAuthzError } from "@/lib/authz";
import { ok, serialize } from "@/lib/json";

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
