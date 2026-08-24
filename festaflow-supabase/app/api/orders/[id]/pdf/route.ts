import { prisma } from "@/lib/prisma";
import { requireAuth, requireModule, assertRecordBranchAccess, handleAuthzError } from "@/lib/authz";
import { buildOrderPdf, orderPdfInclude } from "@/lib/pdf";

// Direct PDF download for an OS ("Baixar PDF"). Same authz/IDOR guard as
// app/api/orders/[id]/send: the order is looked up by id and its branch is
// checked against the caller's own branches before anything is generated.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    requireModule(auth, "orders");
    const { id } = await params;

    const order = await prisma.serviceOrder.findUnique({ where: { id, deletedAt: null }, include: orderPdfInclude });
    assertRecordBranchAccess(auth, order, "OS nao encontrada.");

    const pdf = await buildOrderPdf(order);
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="OS-${order.code}.pdf"`,
        "Content-Length": String(pdf.length),
      },
    });
  } catch (error) {
    return handleAuthzError(error);
  }
}
