// Email sending abstraction. Reads SMTP credentials only from environment
// variables (never hardcoded, never sent to the client). When SMTP_HOST is
// not configured, send() logs and returns a "skipped" result instead of
// throwing — a missing/unconfigured provider must never break the caller's
// business transaction (e.g. marking an appointment as completed).

import { hasStructuredOrderAddress } from "@/lib/order-address";

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}

export interface EmailResult {
  sent: boolean;
  skipped?: boolean;
  error?: string;
}

// EMAIL_FROM already supports nodemailer's "Display Name <address>" syntax
// (e.g. "LeeveLimpeza <atendimento@leevelimpeza.com.br>") - set it that way
// in the environment, no separate name/address variables needed.
async function sendViaSmtp(message: EmailMessage): Promise<EmailResult> {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.EMAIL_FROM;

  if (!host || !port || !user || !pass || !from) {
    console.warn("[email] SMTP not configured (SMTP_HOST/PORT/USER/PASS/EMAIL_FROM) - skipping send to", message.to);
    return { sent: false, skipped: true };
  }

  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host,
      port: Number(port),
      secure: Number(port) === 465,
      // Fails fast instead of hanging the request indefinitely if the SMTP
      // host is unreachable or the greeting/auth stalls.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
      auth: { user, pass },
    });
    await transporter.sendMail({
      from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      attachments: message.attachments?.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType })),
    });
    return { sent: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido ao enviar e-mail.";
    console.error("[email] Falha ao enviar e-mail para", message.to, "-", errorMessage);
    return { sent: false, error: errorMessage };
  }
}

// clientName/serviceName/orderCode come from user-editable records (clients,
// services, orders) - escaped before interpolation so a name like
// `<img src=x onerror=...>` is sent as literal text in the email body, not
// executed as markup by the recipient's mail client.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendAppointmentCompletedEmail(params: {
  clientEmail: string | null;
  clientName: string;
  serviceName: string;
  date: Date;
  orderCode: string;
}): Promise<EmailResult> {
  if (!params.clientEmail) return { sent: false, skipped: true };
  const dateLabel = params.date.toLocaleDateString("pt-BR");
  const clientName = escapeHtml(params.clientName);
  const serviceName = escapeHtml(params.serviceName);
  const orderCode = escapeHtml(params.orderCode);
  const html = `
    <p>Ola, ${clientName},</p>
    <p>Confirmamos a conclusao do atendimento de <strong>${serviceName}</strong> realizado em ${dateLabel}, referente a OS ${orderCode}.</p>
    <p>Obrigado por confiar na LeeveLimpeza.</p>
  `;
  return sendViaSmtp({ to: params.clientEmail, subject: `Atendimento concluido - OS ${params.orderCode}`, html });
}

const orderStatusLabels: Record<string, string> = { pendente: "Agendado", confirmado: "Confirmado", em_andamento: "Em andamento", finalizado: "Realizado", cancelado: "Cancelado" };

function orderMoney(value: number | string): string {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export interface OrderEmailSummary {
  code: string;
  status: string;
  eventDate: Date;
  location: string;
  addressZip?: string | null;
  addressStreet?: string | null;
  addressNumber?: string | null;
  addressNeighborhood?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
  addressReference?: string | null;
  totalAmount: number | string;
  notes?: string | null;
  clientName: string;
  services: Array<{ name: string; quantity: number; unitPrice: number | string }>;
  appointments: Array<{ date: Date; startTime: string; endTime: string; status: string }>;
  employeeNames: string[];
}

// The `to` address is intentionally caller-supplied (the send-OS UI lets the
// user pick/override the destination address - see app/api/orders/[id]/send)
// - only the OS *content* below must always come from already-validated DB
// data, never from client input. `pdf` is optional so a caller can still
// send the summary if PDF generation itself fails for some reason.
export async function sendOrderEmail(params: {
  to: string;
  subject: string;
  message?: string | null;
  order: OrderEmailSummary;
  pdf?: { filename: string; content: Buffer };
}): Promise<EmailResult> {
  const o = params.order;
  const clientName = escapeHtml(o.clientName);
  const orderCode = escapeHtml(o.code);
  const addressHtml = hasStructuredOrderAddress(o)
    ? [
        `${escapeHtml(o.addressStreet!)}, ${escapeHtml(o.addressNumber!)} - ${escapeHtml(o.addressNeighborhood!)}`,
        `${escapeHtml(o.addressCity!)}/${escapeHtml(o.addressState!)}${o.addressZip ? ` - CEP: ${escapeHtml(o.addressZip)}` : ""}`,
        o.addressReference ? `Referencia: ${escapeHtml(o.addressReference)}` : "",
      ].filter(Boolean).join("<br/>")
    : escapeHtml(o.location);
  const statusLabel = escapeHtml(orderStatusLabels[o.status] ?? o.status);
  const dateLabel = o.eventDate.toLocaleDateString("pt-BR", { timeZone: "UTC" });
  const employeeNames = o.employeeNames.length > 0 ? escapeHtml(o.employeeNames.join(", ")) : "Equipe nao definida";

  const servicesHtml = o.services
    .map((s) => `<li>${escapeHtml(s.name)} x${s.quantity} - ${orderMoney(Number(s.quantity) * Number(s.unitPrice))}</li>`)
    .join("");

  const appointmentsHtml = o.appointments
    .map((a) => `<li>${a.date.toLocaleDateString("pt-BR", { timeZone: "UTC" })} ${a.startTime}-${a.endTime} - ${escapeHtml(orderStatusLabels[a.status] ?? a.status)}</li>`)
    .join("");

  const messageHtml = params.message ? `<p>${escapeHtml(params.message).replace(/\n/g, "<br/>")}</p>` : "";
  const notesHtml = o.notes ? `<p><strong>Observacoes:</strong> ${escapeHtml(o.notes)}</p>` : "";

  const html = `
    <p>Ola, ${clientName},</p>
    ${messageHtml}
    <p>Segue o resumo da sua Ordem de Servico <strong>${orderCode}</strong> - LeeveLimpeza.</p>
    <table cellpadding="4" cellspacing="0">
      <tr><td><strong>Codigo</strong></td><td>${orderCode}</td></tr>
      <tr><td><strong>Cliente</strong></td><td>${clientName}</td></tr>
      <tr><td><strong>Data</strong></td><td>${dateLabel}</td></tr>
      <tr><td><strong>Local</strong></td><td>${addressHtml}</td></tr>
      <tr><td><strong>Funcionarios</strong></td><td>${employeeNames}</td></tr>
      <tr><td><strong>Status</strong></td><td>${statusLabel}</td></tr>
      <tr><td><strong>Valor total</strong></td><td>${orderMoney(o.totalAmount)}</td></tr>
    </table>
    <p><strong>Servicos contratados:</strong></p>
    <ul>${servicesHtml}</ul>
    ${o.appointments.length > 0 ? `<p><strong>Atendimentos:</strong></p><ul>${appointmentsHtml}</ul>` : ""}
    ${notesHtml}
    ${params.pdf ? "<p>A OS completa esta anexada a este e-mail em PDF.</p>" : ""}
    <p>Obrigado por confiar na LeeveLimpeza.</p>
  `;

  return sendViaSmtp({
    to: params.to,
    subject: params.subject,
    html,
    attachments: params.pdf ? [{ filename: params.pdf.filename, content: params.pdf.content, contentType: "application/pdf" }] : undefined,
  });
}
