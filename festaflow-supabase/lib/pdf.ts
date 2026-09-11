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
//
// Recurring OS: a ServiceOrder created by a recurrence (see
// app/api/recurring-schedules) is a normal, complete OS - its
// `appointments` already hold every generated occurrence (see
// lib/recurrence.ts generateAppointments). This file renders ALL of them,
// not just the first, and adds a dedicated "Recorrencia" section sourced
// from the same RecurringSchedule row the on-screen print view reads (see
// lib/recurrence-label.ts) - one data source for both surfaces (req. #12).
import PDFDocument from "pdfkit";
import type { Prisma } from "@prisma/client";
import { hasStructuredOrderAddress } from "@/lib/order-address";
import { orderStatusLabel } from "@/lib/order-status";
import { recurrenceTypeLabel, recurrenceFrequencyLabel, recurrenceDayLabel, recurrencePeriodLabel } from "@/lib/recurrence-label";

const orderPdfInclude = {
  client: true,
  branch: { select: { id: true, name: true, city: true } },
  items: { include: { service: true } },
  employees: { include: { employee: true } },
  appointments: { include: { employee: { select: { id: true, name: true } } }, orderBy: [{ date: "asc" as const }, { startTime: "asc" as const }] },
  // At most one active recurrence per OS in practice, but selected as a list
  // (matches the schema's 1:N) so a historical/inactive row never hides data.
  recurringSchedules: { select: { id: true, frequency: true, interval: true, dayOfWeek: true, dayOfMonth: true, startDate: true, endDate: true, active: true } },
} satisfies Prisma.ServiceOrderInclude;

export type OrderForPdf = Prisma.ServiceOrderGetPayload<{ include: typeof orderPdfInclude }>;
export { orderPdfInclude };

const paymentMethodLabels: Record<string, string> = { pix: "PIX", credit_card: "Cartao de credito", debit_card: "Cartao de debito", cash: "Dinheiro", boleto: "Boleto" };

const PAGE_LEFT = 50;
const PAGE_RIGHT = 545;
const CONTENT_WIDTH = PAGE_RIGHT - PAGE_LEFT;

// No | Data | Horario | Funcionario | Status | Valor
const APPT_COLS = [
  { label: "No", x: PAGE_LEFT, width: 22 },
  { label: "Data", x: PAGE_LEFT + 22, width: 62 },
  { label: "Horario", x: PAGE_LEFT + 84, width: 68 },
  { label: "Funcionario", x: PAGE_LEFT + 152, width: 148 },
  { label: "Status", x: PAGE_LEFT + 300, width: 70 },
  { label: "Valor", x: PAGE_LEFT + 370, width: PAGE_RIGHT - (PAGE_LEFT + 370) },
] as const;

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

/** Adds a page when `neededHeight` would overflow the current page. Returns true if it broke. */
function pageBreakIfNeeded(doc: PDFKit.PDFDocument, neededHeight: number): boolean {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + neededHeight <= bottom) return false;
  doc.addPage();
  return true;
}

function drawAppointmentsTableHeader(doc: PDFKit.PDFDocument): void {
  const y = doc.y;
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#000");
  for (const col of APPT_COLS) {
    doc.text(col.label, col.x, y, { width: col.width, align: col.label === "Valor" ? "right" : "left" });
  }
  doc.moveDown(0.3);
  doc.moveTo(PAGE_LEFT, doc.y).lineTo(PAGE_RIGHT, doc.y).strokeColor("#ccc").stroke();
  doc.moveDown(0.3);
  doc.font("Helvetica").fontSize(9).fillColor("#000");
}

/** Builds the OS PDF entirely from already-fetched DB data - never re-derives totals or accepts client input. */
export function buildOrderPdf(order: OrderForPdf): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const employeeNames = order.employees.map((e) => e.employee.name).join(", ") || "Equipe nao definida";
    const schedule = order.recurringSchedules[0];

    doc.font("Helvetica-Bold").fontSize(20).text("LeeveLimpeza", { continued: false });
    doc.font("Helvetica").fontSize(10).fillColor("#555").text("Ordem de Servico");
    if (order.branch) doc.text(`${order.branch.name} - ${order.branch.city}`);
    doc.fillColor("#000");
    doc.moveUp(order.branch ? 3 : 2);
    doc.font("Helvetica-Bold").fontSize(12).text(order.code, { align: "right" });
    doc.font("Helvetica").fontSize(9).fillColor("#555").text(`Status: ${orderStatusLabel(order)}`, { align: "right" });
    doc.fillColor("#000");
    doc.moveDown(1.5);
    doc.moveTo(PAGE_LEFT, doc.y).lineTo(PAGE_RIGHT, doc.y).strokeColor("#ddd").stroke();
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

    doc.font("Helvetica-Bold").fontSize(11).text("Equipe e valores");
    doc.font("Helvetica").fontSize(10);
    doc.text(`Funcionarios: ${employeeNames}`);
    doc.text(`Forma de pagamento: ${paymentLabel(order)}`);
    doc.font("Helvetica-Bold").text(`Total: ${money(order.totalAmount)}`);
    doc.moveDown();

    if (schedule) {
      doc.font("Helvetica-Bold").fontSize(11).text("Recorrencia");
      doc.font("Helvetica").fontSize(10);
      doc.text(`Tipo: ${recurrenceTypeLabel(schedule)}`);
      doc.text(`Frequencia: ${recurrenceFrequencyLabel(schedule)}`);
      doc.text(`Dia: ${recurrenceDayLabel(schedule)}`);
      doc.text(`Periodo: ${recurrencePeriodLabel(schedule)}`);
      doc.text(`Ocorrencias geradas: ${order.appointments.length}`);
      if (!schedule.active) { doc.fillColor("#888"); doc.text("(recorrencia encerrada/inativa)"); doc.fillColor("#000"); }
      doc.moveDown();
    }

    if (order.appointments.length > 0) {
      doc.font("Helvetica-Bold").fontSize(11).text(schedule ? `Atendimentos da recorrencia (${order.appointments.length})` : `Atendimentos (${order.appointments.length})`);
      doc.moveDown(0.3);
      drawAppointmentsTableHeader(doc);

      let nonCancelledCount = 0;
      order.appointments.forEach((a, index) => {
        // Fixed per-row height at font size 9 with a little padding - matches
        // what .text() below actually consumes, so the page-break check
        // never lets a row start right at the bottom edge and get clipped.
        const rowHeight = 14;
        if (pageBreakIfNeeded(doc, rowHeight)) {
          drawAppointmentsTableHeader(doc);
        }
        const y = doc.y;
        const statusTxt = orderStatusLabel(a);
        const who = a.employee?.name || employeeNames;
        if (!a.cancelledAt) nonCancelledCount += 1;
        doc.fillColor(a.cancelledAt ? "#999" : "#000");
        doc.text(String(index + 1), APPT_COLS[0].x, y, { width: APPT_COLS[0].width });
        doc.text(dateLabel(a.date), APPT_COLS[1].x, y, { width: APPT_COLS[1].width });
        doc.text(`${a.startTime}-${a.endTime}`, APPT_COLS[2].x, y, { width: APPT_COLS[2].width });
        doc.text(who, APPT_COLS[3].x, y, { width: APPT_COLS[3].width });
        doc.text(statusTxt, APPT_COLS[4].x, y, { width: APPT_COLS[4].width });
        doc.text(money(order.totalAmount), APPT_COLS[5].x, y, { width: APPT_COLS[5].width, align: "right" });
        doc.fillColor("#000");
        doc.y = y + rowHeight;
      });

      doc.moveDown(0.5);
      if (schedule) {
        // Same rule the dashboard uses for "valor de ocorrencias" (see
        // app/api/dashboard/route.ts loadOccurrences): each non-cancelled
        // appointment inherits the OS's total_amount once. Not a new
        // financial rule - just applied here for the recurrence's own total.
        const recurrenceTotal = nonCancelledCount * Number(order.totalAmount);
        doc.font("Helvetica").fontSize(10);
        doc.text(`${nonCancelledCount} atendimento(s) nao cancelado(s) - valor por atendimento: ${money(order.totalAmount)}`);
        doc.font("Helvetica-Bold").text(`Total da recorrencia: ${money(recurrenceTotal)}`);
        doc.moveDown();
      }
    }

    if (order.notes) {
      pageBreakIfNeeded(doc, 40);
      doc.font("Helvetica-Bold").fontSize(11).text("Observacoes");
      doc.font("Helvetica").fontSize(10).text(order.notes);
      doc.moveDown();
    }

    // Signature area - always last, after every page of content (including
    // every appointment row), never mid-document. pageBreakIfNeeded keeps
    // the two boxes and their labels together as one block instead of
    // splitting across a page boundary. Mirrors PrintOrder's own
    // signature-block exactly (same two roles, same fallback name) so PDF
    // and print never show different signature fields.
    pageBreakIfNeeded(doc, 90);
    doc.moveDown(2);
    const sigY = doc.y;
    const sigColGap = 20;
    const sigColWidth = (CONTENT_WIDTH - sigColGap) / 2;
    const sigLeftX = PAGE_LEFT;
    const sigRightX = PAGE_LEFT + sigColWidth + sigColGap;
    doc.strokeColor("#000");
    doc.moveTo(sigLeftX, sigY).lineTo(sigLeftX + sigColWidth, sigY).stroke();
    doc.moveTo(sigRightX, sigY).lineTo(sigRightX + sigColWidth, sigY).stroke();
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#000");
    doc.text("Assinatura do cliente", sigLeftX, sigY + 6, { width: sigColWidth, height: 14, align: "center" });
    doc.text("Assinatura do responsavel / funcionario", sigRightX, sigY + 6, { width: sigColWidth, height: 14, align: "center" });
    doc.font("Helvetica").fontSize(9);
    doc.text(order.signatureName || order.client?.name || "-", sigLeftX, sigY + 20, { width: sigColWidth, height: 14, align: "center" });
    doc.text("LeeveLimpeza", sigRightX, sigY + 20, { width: sigColWidth, height: 14, align: "center" });
    doc.y = sigY + 40;

    // Page numbers + a running header on every page after the first (the
    // first page already carries the full header) - added as a final pass
    // over every buffered page, since the total page count is only known
    // once all content above has been written.
    //
    // Passing an explicit `height` (not just `width`) is required on every
    // one of these calls: PDFKit's own LineWrapper only skips its automatic
    // page-break when a text call's `height` option is set (see
    // node_modules/pdfkit LineWrapper.nextSection - `if (this.height !=
    // null) return false`), regardless of `lineBreak` or explicit x/y.
    // Without it, writing this footer near the bottom margin was
    // misinterpreted as flowing text that "overflows" and silently added a
    // blank trailing page (with the footer itself baked in as "Pagina 1 de
    // 1" on what was actually a longer document) - found via a pageAdded
    // listener during validation, not visible from the promise ever
    // resolving successfully.
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const pageNumber = i - range.start + 1;
      if (pageNumber > 1) {
        doc.font("Helvetica-Bold").fontSize(9).fillColor("#555").text(`LeeveLimpeza  -  ${order.code}`, PAGE_LEFT, 20, { width: CONTENT_WIDTH, height: 16, lineBreak: false });
      }
      doc.font("Helvetica").fontSize(8).fillColor("#888").text(
        `Pagina ${pageNumber} de ${range.count}  -  Documento gerado em ${new Date().toLocaleString("pt-BR")}`,
        PAGE_LEFT,
        doc.page.height - 30,
        { width: CONTENT_WIDTH, height: 16, align: "center", lineBreak: false }
      );
      doc.fillColor("#000");
    }

    doc.end();
  });
}
