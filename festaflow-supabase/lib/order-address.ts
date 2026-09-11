// Shared between server (API routes, PDF, e-mail) and client (OS form/detail
// view) - plain data helpers only, no server-only imports, safe in both bundles.

export type OrderAddressFields = {
  addressZip?: string | null;
  addressStreet?: string | null;
  addressNumber?: string | null;
  addressNeighborhood?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
  addressReference?: string | null;
};

// Orders created before the structured fields existed have all of these
// null - callers use this to decide between the structured display and the
// legacy `location` fallback, without guessing at partially-filled data.
export function hasStructuredOrderAddress(o: OrderAddressFields): boolean {
  return Boolean(o.addressStreet && o.addressNumber && o.addressNeighborhood && o.addressCity && o.addressState);
}

// Single-line mirror written to the legacy `location` column on every
// create/update so anything still reading it directly (WhatsApp message,
// older reports) keeps seeing a sensible value - never shown to the user
// directly for orders that have the structured fields.
export function formatOrderAddressLine(o: OrderAddressFields): string {
  const parts: string[] = [];
  if (o.addressStreet) parts.push(o.addressNumber ? `${o.addressStreet}, ${o.addressNumber}` : o.addressStreet);
  if (o.addressNeighborhood) parts.push(o.addressNeighborhood);
  const cityState = [o.addressCity, o.addressState].filter(Boolean).join("/");
  if (cityState) parts.push(cityState);
  return parts.join(" - ");
}

// The service address of a new/edited OS is ALWAYS a snapshot of the client's
// registered address at that moment - never typed on the OS form, never
// accepted from the request body. `Client` rows already match this shape
// (same 7 columns), so a client passes straight through here.
export function orderAddressSnapshot(source: OrderAddressFields): OrderAddressFields {
  return {
    addressZip: source.addressZip ?? null,
    addressStreet: source.addressStreet ?? null,
    addressNumber: source.addressNumber ?? null,
    addressNeighborhood: source.addressNeighborhood ?? null,
    addressCity: source.addressCity ?? null,
    addressState: source.addressState ?? null,
    addressReference: source.addressReference ?? null,
  };
}

// Whether a client's address is usable as the source for an OS. Mirrors the
// minimum required set enforced elsewhere (Rua/Numero/Bairro/Cidade/Estado):
//  - "ok"        : every required field present -> OS can be created
//  - "incomplete": some but not all present -> user must finish the cadastro
//  - "missing"   : none present (e.g. a legacy client) -> user must cadastrar
export type ClientAddressState = "ok" | "incomplete" | "missing";

export function evaluateClientAddress(c: OrderAddressFields): ClientAddressState {
  const required = [c.addressStreet, c.addressNumber, c.addressNeighborhood, c.addressCity, c.addressState];
  if (required.every(Boolean)) return "ok";
  if (required.some(Boolean)) return "incomplete";
  return "missing";
}

// User-facing messages, shared between the API routes and every OS/recorrencia
// form so the wording never drifts between the client-side guard and the
// server rejection (see lib/validators.ts orderValidationError for the same
// pattern applied to plain field errors).
export const CLIENT_ADDRESS_MISSING_MESSAGE =
  "Nao e possivel criar esta OS porque o cliente nao possui endereco cadastrado. Cadastre o endereco do cliente antes de continuar.";
export const CLIENT_ADDRESS_INCOMPLETE_MESSAGE =
  "O endereco do cliente esta incompleto. Preencha Rua, Numero, Bairro, Cidade e Estado no cadastro do cliente antes de criar a OS.";

const ADDRESS_FIELD_LABELS: Array<[keyof OrderAddressFields, string]> = [
  ["addressStreet", "Rua"],
  ["addressNumber", "Numero"],
  ["addressNeighborhood", "Bairro"],
  ["addressCity", "Cidade"],
  ["addressState", "Estado/UF"],
];

// Which of the 5 required address fields are missing, in a fixed order, so
// "Faltam: X e Y" is built identically everywhere it appears.
export function missingAddressFieldLabels(c: OrderAddressFields): string[] {
  return ADDRESS_FIELD_LABELS.filter(([key]) => !c[key]).map(([, label]) => label);
}

function joinPt(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

// `client` is optional only so old call sites (state alone) still compile -
// every real caller should pass it: it is what turns "endereco incompleto"
// into "Faltam: Numero e Estado/UF" instead of a generic sentence.
export function clientAddressErrorMessage(state: ClientAddressState, client?: (OrderAddressFields & { name?: string }) | null): string {
  if (state === "missing" || !client) return CLIENT_ADDRESS_MISSING_MESSAGE;
  const missing = missingAddressFieldLabels(client);
  if (missing.length === 0) return CLIENT_ADDRESS_INCOMPLETE_MESSAGE;
  const who = client.name ? `O cliente ${client.name}` : "O cliente";
  return `${who} nao possui endereco completo. Faltam: ${joinPt(missing)}. Complete o endereco do cliente antes de continuar.`;
}
