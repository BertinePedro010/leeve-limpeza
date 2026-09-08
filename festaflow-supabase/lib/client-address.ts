// Client address helpers - the exact counterpart of lib/order-address.ts, for
// the Client model instead of ServiceOrder. Shared between server (API routes)
// and client (client form / detail view): plain data helpers only, no
// server-only imports, safe in both bundles.

export type ClientAddressFields = {
  addressZip?: string | null;
  addressStreet?: string | null;
  addressNumber?: string | null;
  addressNeighborhood?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
  addressReference?: string | null;
};

// Clients created before the structured fields existed have all of these
// null - callers use this to decide between the structured display and the
// legacy `address` free-text fallback, without guessing at partial data.
export function hasStructuredClientAddress(c: ClientAddressFields): boolean {
  return Boolean(c.addressStreet && c.addressNumber && c.addressNeighborhood && c.addressCity && c.addressState);
}

// Single-line mirror written to the legacy `address` column on every
// create/update so anything still reading it directly (e.g. the OS PDF's
// "Endereco" line for the client) keeps seeing a sensible value.
export function formatClientAddressLine(c: ClientAddressFields): string {
  const parts: string[] = [];
  if (c.addressStreet) parts.push(c.addressNumber ? `${c.addressStreet}, ${c.addressNumber}` : c.addressStreet);
  if (c.addressNeighborhood) parts.push(c.addressNeighborhood);
  const cityState = [c.addressCity, c.addressState].filter(Boolean).join("/");
  if (cityState) parts.push(cityState);
  if (c.addressReference) parts.push(`Ref.: ${c.addressReference}`);
  return parts.join(" - ");
}
