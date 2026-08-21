// Email sending abstraction. Reads SMTP credentials only from environment
// variables (never hardcoded, never sent to the client). When SMTP_HOST is
// not configured, send() logs and returns a "skipped" result instead of
// throwing — a missing/unconfigured provider must never break the caller's
// business transaction (e.g. marking an appointment as completed).

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

export interface EmailResult {
  sent: boolean;
  skipped?: boolean;
  error?: string;
}

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
      auth: { user, pass },
    });
    await transporter.sendMail({ from, to: message.to, subject: message.subject, html: message.html });
    return { sent: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido ao enviar e-mail.";
    console.error("[email] Falha ao enviar e-mail para", message.to, "-", errorMessage);
    return { sent: false, error: errorMessage };
  }
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
  const html = `
    <p>Ola, ${params.clientName},</p>
    <p>Confirmamos a conclusao do atendimento de <strong>${params.serviceName}</strong> realizado em ${dateLabel}, referente a OS ${params.orderCode}.</p>
    <p>Obrigado por confiar na LeeveLimpeza.</p>
  `;
  return sendViaSmtp({ to: params.clientEmail, subject: `Atendimento concluido - OS ${params.orderCode}`, html });
}
