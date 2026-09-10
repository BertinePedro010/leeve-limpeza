import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { requireAuth, requireModule, resolveBranchIdForCreate, resolveBranchFilter, AuthzError, handleAuthzError } from "@/lib/authz";
import { orderSchema, orderValidationError } from "@/lib/validators";
import { syncOrderBilling } from "@/lib/billing";
import { formatOrderAddressLine, orderAddressSnapshot, evaluateClientAddress, clientAddressErrorMessage } from "@/lib/order-address";
import { fail, ok, serialize } from "@/lib/json";

// Must be called with the *transaction* client when running inside
// prisma.$transaction - the connection pool here is capped at 1 connection,
// so calling the outer `prisma` singleton from inside an open transaction
// deadlocks (the transaction holds the only connection while waiting on a
// query that itself needs a connection).
async function nextCode(client: Prisma.TransactionClient | typeof prisma, branchId: string) {
  const year = new Date().getFullYear();
  const count = await client.serviceOrder.count({ where: { branchId } });
  return `OS-${year}-${String(count + 1).padStart(4, "0")}`;
}

function total(items: Array<{ quantity: number; unitPrice: number }>) {
  return items.reduce((sum, item) => sum + item.quantity * Number(item.unitPrice), 0);
}

// `transactions` (real amounts/status/payment method) is exactly what the
// "finance" module gates elsewhere (see app/api/transactions/route.ts) - a
// user with only "orders" must not recover that data through an order's
// embedded relations, so it is included only when the caller can also view
// finance. Everything else here is inherent to viewing an order and stays
// unconditional.
// `attachments` intentionally dropped from this include - no frontend view
// reads it (the Order type has no `attachments` field), so fetching it on
// every order was pure payload weight with zero consumer.
function include(canViewFinance: boolean) {
  return { client: true, branch: { select: { id: true, name: true, city: true } }, items: { include: { service: true } }, employees: { include: { employee: true } }, transactions: canViewFinance, appointments: { include: { employee: { select: { id: true, name: true } } }, orderBy: [{ date: "asc" as const }, { startTime: "asc" as const }] } };
}

// Returns the validated client so the caller can snapshot its address into
// the OS without a second query - the client registration is the single
// source of truth for a new/edited OS's service address.
async function assertSameBranchRelations(
  branchId: string,
  clientId: string,
  serviceIds: string[],
  employeeIds: string[]
) {
  const [client, services, employees] = await Promise.all([
    prisma.client.findUnique({ where: { id: clientId } }),
    prisma.service.findMany({ where: { id: { in: serviceIds } } }),
    prisma.employee.findMany({ where: { id: { in: employeeIds } } }),
  ]);
  if (!client || client.branchId !== branchId || client.deletedAt) {
    throw new AuthzError("Cliente nao pertence a filial da OS.", 422);
  }
  if (services.length !== serviceIds.length || services.some((s) => s.branchId !== branchId)) {
    throw new AuthzError("Um ou mais servicos nao pertencem a filial da OS.", 422);
  }
  if (employees.length !== employeeIds.length || employees.some((e) => e.branchId !== branchId)) {
    throw new AuthzError("Um ou mais funcionarios nao pertencem a filial da OS.", 422);
  }
  return client;
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    requireModule(auth, "orders");
    const url = new URL(request.url);
    const branchId = url.searchParams.get("branchId");
    // Optional partial, case-insensitive client-name search. Applied in the
    // DB query (never a frontend filter) and AFTER the same branch resolution
    // as before, so it can only ever narrow the caller's own branch scope -
    // a search term can never widen it to another filial.
    const clientSearch = url.searchParams.get("clientSearch")?.trim();
    const canViewFinance = auth.profile.role === "admin" || auth.profile.allowedModules.includes("finance");
    const data = await prisma.serviceOrder.findMany({
      where: {
        deletedAt: null,
        branchId: resolveBranchFilter(auth, branchId),
        ...(clientSearch ? { client: { name: { contains: clientSearch, mode: "insensitive" as const } } } : {}),
      },
      orderBy: { eventDate: "asc" },
      include: include(canViewFinance),
    });
    return ok(serialize(data));
  } catch (error) {
    return handleAuthzError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    requireModule(auth, "orders");
    const parsed = orderSchema.safeParse(await request.json());
    if (!parsed.success) { const { message, field } = orderValidationError(parsed.error); return fail(message, 422, field); }
    const canViewFinance = auth.profile.role === "admin" || auth.profile.allowedModules.includes("finance");
    const branchId = resolveBranchIdForCreate(auth, parsed.data.branchId);
    const { items, employeeIds, dates, branchId: _branchId, ...body } = parsed.data;
    const client = await assertSameBranchRelations(branchId, body.clientId, items.map((i) => i.serviceId), employeeIds);

    // The service address is taken exclusively from the client's cadastro -
    // never from the request body. A new OS cannot be created for a client
    // whose address is missing or incomplete (frontend guards this too, but
    // this is the real trust boundary).
    const clientAddressState = evaluateClientAddress(client);
    if (clientAddressState !== "ok") {
      return fail(clientAddressErrorMessage(clientAddressState), 422, "clientId");
    }
    const address = orderAddressSnapshot(client);

    // dates omitted (or empty): preserve prior behavior - exactly one
    // appointment mirroring eventDate/startTime/endTime. dates present: one
    // appointment per selected date, all under the same OS.
    const appointmentDates = dates && dates.length > 0 ? dates : [body.eventDate];
    // The occurrence on the OS's own event date is the "principal" - it
    // inherits the OS status (an OS created as "confirmado" means that date is
    // confirmed). Every other date is a scheduled extra -> default "pendente"
    // (label "Agendado"). Each occurrence keeps its own status from here on;
    // the Dashboard counts occurrences by THIS status, not the OS status.
    const eventDateKey = new Date(body.eventDate).toISOString().slice(0, 10);
    const statusForDate = (date: Date) =>
      new Date(date).toISOString().slice(0, 10) === eventDateKey ? body.status : "pendente";

    const data = await prisma.$transaction(async (tx) => {
      const order = await tx.serviceOrder.create({
        data: {
          ...body,
          ...address,
          location: formatOrderAddressLine(address),
          branchId,
          createdBy: auth.userId,
          code: await nextCode(tx, branchId),
          totalAmount: total(items),
          items: { create: items },
          employees: { create: employeeIds.map((employeeId) => ({ employeeId })) },
        },
      });
      await tx.appointment.createMany({
        data: appointmentDates.map((date) => ({
          orderId: order.id,
          branchId,
          date,
          startTime: body.startTime,
          endTime: body.endTime,
          status: statusForDate(date),
        })),
      });
      // Covers the rare case of an order created already in "finalizado"
      // status - keeps billing in sync from the very first write, not just
      // from subsequent edits. `order` is passed in (skips a redundant
      // re-fetch) and the existing-transaction lookup is skipped entirely -
      // `order.id` was just generated by this same transaction, so no prior
      // transaction could possibly reference it yet.
      await syncOrderBilling(tx, order.id, { order, skipExistingLookup: true });
      // Re-read with the full include AFTER appointments exist - creating
      // with `include` would have returned an order.appointments snapshot
      // from before appointment.createMany ran (same stale-response class of
      // bug already fixed once for the cascade-cancel path in PUT below).
      return tx.serviceOrder.findUniqueOrThrow({ where: { id: order.id }, include: include(canViewFinance) });
    }, { timeout: 15000 });
    return ok(serialize(data), 201);
  } catch (error) {
    return handleAuthzError(error);
  }
}
