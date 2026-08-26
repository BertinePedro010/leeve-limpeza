// Server-side PDF generation for a Service Order (OS). This is the only
// place that produces real PDF bytes - the existing "PDF" button in the UI
// (components/SaasApp.tsx PrintOrder) is a browser print()-to-PDF view and
// never runs outside an interactive browser, so it cannot be reused for an
// emailed attachment or a direct file download from an API route. This
// generator mirrors PrintOrder's fields/sections so the emailed/downloaded
// document matches what the UI already shows, without touching that
// component. Uses the standard 14 PDF fonts (Helvetica) with WinAnsi
// encoding, which covers Portuguese accents (áéíóúãõâêôç) without embedding
// a custom font.
import PDFDocument from "pdfkit";
import type { Prisma } from "@prisma/client";
import { hasStructuredOrderAddress } from "@/lib/order-address";

const orderPdfInclude = {
  client: true,
  branch: { select: { id: true, name: true, city: true } },
  items: { include: { service: true } },
  employees: { include: { employee: true } },
  appointments: { include: { employee: { select: { id: true, name: true } } }, orderBy: [{ date: "asc" as const }, { startTime: "asc" as const }] },
} satisfies Prisma.ServiceOrderInclude;

export type OrderForPdf = Prisma.ServiceOrderGetPayload<{ include: typeof orderPdfInclude }>;
export { orderPdfInclude };

const statusLabels: Record<string, string> = { pendente: "Agendado", confirmado: "Confirmado", em_andamento: "Em andamento", finalizado: "Realizado", cancelado: "Cancelado" };
const paymentMethodLabels: Record<string, string> = { pix: "PIX", credit_card: "Cartao de credito", debit_card: "Cartao de debito", cash: "Dinheiro" };

function money(value: Prisma.Decimal | number | string): string {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function dateLabel(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}
function paymentLabel(order: Pick<OrderForPdf, "paymentMethod" | "paymentMethodLegacy">): string {
  if (order.paymentMethod) return paymentMethodLabels[order.paymentMethod] || order.paymentMethod;
  if (order.paymentMethodLegacy) return `${order.paymentMethodLegacy} (legado)`;
  return "Nao informado";
}

/** Builds the OS PDF entirely from already-fetched DB data - never re-derives totals or accepts client input. */
export function buildOrderPdf(order: OrderForPdf): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(20).text("LeeveLimpeza", { continued: false });
    doc.font("Helvetica").fontSize(10).fillColor("#555").text("Ordem de Servico");
    if (order.branch) doc.text(`${order.branch.name} - ${order.branch.city}`);
    doc.fillColor("#000");
    doc.moveUp(order.branch ? 3 : 2);
    doc.font("Helvetica-Bold").fontSize(12).text(order.code, { align: "right" });
    doc.font("Helvetica").fontSize(9).fillColor("#555").text(`Status: ${statusLabels[order.status] ?? order.status}`, { align: "right" });
    doc.fillColor("#000");
    doc.moveDown(1.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#ddd").stroke();
    doc.moveDown();

    doc.font("Helvetica-Bold").fontSize(11).text("Cliente");
    doc.font("Helvetica").fontSize(10);
    doc.text(`Nome: ${order.client?.name ?? "-"}`);
    if (order.client?.phone) doc.text(`Telefone: ${order.client.phone}`);
    if (order.client?.email) doc.text(`E-mail: ${order.client.email}`);
    if (order.client?.address) doc.text(`Endereco do cliente: ${order.client.address}`);
    doc.moveDown(0.5);

    doc.font("Helvetica-Bold").fontSize(11).text("Endereco do atendimento");
    doc.font("Helvetica").fontSize(10);
    if (hasStructuredOrderAddress(order)) {
      doc.text(`${order.addressStreet}, ${order.addressNumber} - ${order.addressNeighborhood}`);
      doc.text(`${order.addressCity}/${order.addressState}${order.addressZip ? `  CEP: ${order.addressZip}` : ""}`);
      if (order.addressReference) doc.text(`Referencia: ${order.addressReference}`);
    } else {
      doc.text(order.location);
    }
    doc.moveDown();

    doc.font("Helvetica-Bold").fontSize(11).text("Servicos contratados");
    doc.font("Helvetica").fontSize(10);
    for (const item of order.items) {
      doc.text(`- ${item.service.name}  x${item.quantity}  ${money(Number(item.quantity) * Number(item.unitPrice))}`);
    }
    doc.moveDown(0.5);

    if (order.appointments.length > 0) {
      doc.font("Helvetica-Bold").fontSize(11).text(`Atendimentos (${order.appointments.length})`);
      doc.font("Helvetica").fontSize(10);
      for (const a of order.appointments) {
        const statusTxt = statusLabels[a.status] ?? a.status;
        const who = a.employee?.name ?? "Equipe da OS";
        doc.text(`- ${dateLabel(a.date)}  ${a.startTime}-${a.endTime}  ${who}  [${statusTxt}]`);
      }
      doc.moveDown(0.5);
    }

    const employeeNames = order.employees.map((e) => e.employee.name).join(", ") || "Equipe nao definida";
    doc.font("Helvetica-Bold").fontSize(11).text("Equipe e valores");
    doc.font("Helvetica").fontSize(10);
    doc.text(`Funcionarios: ${employeeNames}`);
    doc.text(`Forma de pagamento: ${paymentLabel(order)}`);
    doc.font("Helvetica-Bold").text(`Total: ${money(order.totalAmount)}`);
    doc.moveDown();

    if (order.notes) {
      doc.font("Helvetica-Bold").fontSize(11).text("Observacoes");
      doc.font("Helvetica").fontSize(10).text(order.notes);
      doc.moveDown();
    }

    doc.fontSize(8).fillColor("#888").text(`Documento gerado em ${new Date().toLocaleString("pt-BR")}`, { align: "center" });

    doc.end();
  });
}
