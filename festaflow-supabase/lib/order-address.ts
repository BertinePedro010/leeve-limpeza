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
