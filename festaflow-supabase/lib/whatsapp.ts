// WhatsApp message composition, deliberately separated from delivery.
//
// Today "delivery" is the client opening a wa.me link in a new tab (the user
// still has to press send inside WhatsApp themselves - this code never claims
// an automatic send). `buildOrderWhatsappMessage` is the seam meant to survive
// a future swap to the WhatsApp Business API: that integration would call the
// Business API's send-message endpoint with this same message text instead of
// building a wa.me URL, without changing how the message is composed here.

export type OrderForWhatsapp = {
  code: string;
  eventDate: Date;
  totalAmount: number | string;
  status: string;
  client: { name: string } | null;
};

const statusLabels: Record<string, string> = { pendente: "Agendado", confirmado: "Confirmado", em_andamento: "Em andamento", finalizado: "Realizado", cancelado: "Cancelado" };

function money(value: number | string): string {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Normalizes a free-form Brazilian phone number into WhatsApp's expected
 * digits-only format (country code + area code + number, e.g. 5528998887766).
 * Returns null when the input has too few/many digits to plausibly be a
 * phone number - callers must treat null as "no valid number", never guess.
 */
export function normalizeWhatsappPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 13) return null;
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return null;
}

export function buildOrderWhatsappMessage(order: OrderForWhatsapp): string {
  const clientName = order.client?.name ?? "cliente";
  const dateLabel = order.eventDate.toLocaleDateString("pt-BR", { timeZone: "UTC" });
  const statusLabel = statusLabels[order.status] ?? order.status;
  return [
    `Ola, ${clientName}!`,
    `Sua Ordem de Servico ${order.code} da LeeveLimpeza esta disponivel.`,
    `Data: ${dateLabel}`,
    `Valor: ${money(order.totalAmount)}`,
    `Status: ${statusLabel}`,
    "",
    "Qualquer duvida, estamos a disposicao.",
  ].join("\n");
}

export function buildWhatsappShareUrl(phoneDigits: string, message: string): string {
  return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}`;
}
