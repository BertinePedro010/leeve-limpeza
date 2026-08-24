import { prisma } from "@/lib/prisma";
import { requireAuth, requireModule, assertRecordBranchAccess, handleAuthzError } from "@/lib/authz";
import { sendOrderSchema } from "@/lib/validators";
import { fail, ok, serialize } from "@/lib/json";
import { buildOrderPdf, orderPdfInclude } from "@/lib/pdf";
import { sendOrderEmail } from "@/lib/email";
import { normalizeWhatsappPhone } from "@/lib/whatsapp";

// Sends (or logs the sending of) an OS to a client via email or WhatsApp.
//
// Security model - every field that matters is re-derived server-side, never
// trusted from the request body:
//   - `id` (order) is looked up, then assertRecordBranchAccess() confirms it
//     belongs to a branch the authenticated caller can access (404, not 403,
//     for a cross-branch id - see lib/authz.ts docstring). This is the IDOR
//     guard: changing the id in the URL to another branch's OS cannot leak
//     that OS's data or send it anywhere.
//   - branchId is never read from the body at all.
//   - the OS content (client, items, appointments, employees, totals) is
//     always the freshly-fetched DB record, never anything the client sent.
//   - only `to` (destination address/number) and the optional `message` are
//     caller-supplied, by design (the send-OS modal lets the user override
//     the client's registered contact) - see sendOrderSchema's comment.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    requireModule(auth, "orders");
    const { id } = await params;

    const order = await prisma.serviceOrder.findUnique({ where: { id, deletedAt: null }, include: orderPdfInclude });
    assertRecordBranchAccess(auth, order, "OS nao encontrada.");

    const parsed = sendOrderSchema.safeParse(await request.json());
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados de envio invalidos.", 422);

    if (parsed.data.channel === "email") {
      const subject = parsed.data.subject?.trim() || `Ordem de Servico ${order.code} - LeeveLimpeza`;
      let pdf: { filename: string; content: Buffer } | undefined;
      try {
        pdf = { filename: `OS-${order.code}.pdf`, content: await buildOrderPdf(order) };
      } catch (pdfError) {
        // A PDF failure must not silently pretend success, but it also
        // should not block the email itself - the HTML summary below still
        // carries every field the PDF would have. Logged server-side only.
        console.error("[orders/send] Falha ao gerar PDF da OS", order.id, "-", pdfError);
      }

      const result = await sendOrderEmail({
        to: parsed.data.to,
        subject,
        message: parsed.data.message,
        pdf,
        order: {
          code: order.code,
          status: order.status,
          eventDate: order.eventDate,
          location: order.location,
          totalAmount: order.totalAmount.toString(),
          notes: order.notes,
          clientName: order.client?.name ?? "Cliente",
          services: order.items.map((i) => ({ name: i.service.name, quantity: i.quantity, unitPrice: i.unitPrice.toString() })),
          appointments: order.appointments.map((a) => ({ date: a.date, startTime: a.startTime, endTime: a.endTime, status: a.status })),
          employeeNames: order.employees.map((e) => e.employee.name),
        },
      });

      await prisma.orderSendLog.create({
        data: {
          orderId: order.id,
          branchId: order.branchId,
          channel: "email",
          recipient: parsed.data.to,
          status: result.sent ? "sent" : "failed",
          errorMessage: result.sent ? null : result.skipped ? "Servidor de e-mail (SMTP) nao configurado." : result.error ?? "Falha desconhecida ao enviar e-mail.",
          sentBy: auth.userId,
        },
      });

      if (!result.sent) {
        const message = result.skipped
          ? "Nao foi possivel enviar a OS: o servidor de e-mail nao esta configurado. Contate um administrador."
          : "Nao foi possivel enviar a OS. Verifique o e-mail do cliente ou a configuracao do servidor de e-mail.";
        return fail(message, 502);
      }

      return ok(serialize({ sent: true, to: parsed.data.to }));
    }

    // WhatsApp: the actual "send" is the client opening a wa.me link in the
    // browser BEFORE this request is made (see components/SaasApp.tsx) -
    // there is no server-side delivery to attempt here. This call only
    // records that the user completed that action, for the send-history
    // audit trail. A phone that fails normalization is logged as failed
    // rather than silently accepted, since it means the link the client
    // built could not have been a valid wa.me URL either.
    const normalized = normalizeWhatsappPhone(parsed.data.to);
    await prisma.orderSendLog.create({
      data: {
        orderId: order.id,
        branchId: order.branchId,
        channel: "whatsapp",
        recipient: parsed.data.to,
        status: normalized ? "sent" : "failed",
        errorMessage: normalized ? null : "Numero de WhatsApp invalido.",
        sentBy: auth.userId,
      },
    });
    return ok(serialize({ logged: true }));
  } catch (error) {
    return handleAuthzError(error);
  }
}
