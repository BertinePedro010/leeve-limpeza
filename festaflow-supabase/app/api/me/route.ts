import { prisma } from "@/lib/prisma";
import { requireAuth, handleAuthzError } from "@/lib/authz";
import { ok, serialize } from "@/lib/json";

export async function GET() {
  try {
    const auth = await requireAuth();
    const activeBranchCount = await prisma.branch.count({ where: { active: true } });
    const isGlobalAdmin = auth.profile.role === "admin" && activeBranchCount > 0 && auth.branchIds.length >= activeBranchCount;
    return ok(serialize({ id: auth.userId, name: auth.profile.name, email: auth.profile.email, role: auth.profile.role, allowedModules: auth.profile.allowedModules, isGlobalAdmin }));
  } catch (error) {
    return handleAuthzError(error);
  }
}
