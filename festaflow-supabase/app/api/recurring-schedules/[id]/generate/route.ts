import { prisma } from "@/lib/prisma";
import { requireAuth, assertRecordBranchAccess, handleAuthzError } from "@/lib/authz";
import { ok, serialize } from "@/lib/json";
import { generateAppointments } from "@/lib/recurrence";

// Manually extends generation for a recurrence. Idempotent - calling this
// repeatedly never duplicates appointments (DB unique constraint on
// recurring_schedule_id+date, enforced via skipDuplicates in generateAppointments).
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    const { id } = await params;
    const existing = await prisma.recurringSchedule.findUnique({ where: { id } });
    assertRecordBranchAccess(auth, existing, "Recorrencia nao encontrada.");
    const result = await generateAppointments(id);
    return ok(serialize(result));
  } catch (error) {
    return handleAuthzError(error);
  }
}
