import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { sumRevenue } from "@/lib/billing";
import { displayOrderStatus, orderStatusLabel } from "@/lib/order-status";
import { hasStructuredClientAddress, formatClientAddressLine } from "@/lib/client-address";
import { hasStructuredOrderAddress, formatOrderAddressLine, evaluateClientAddress, missingAddressFieldLabels, clientAddressErrorMessage, orderAddressSnapshot } from "@/lib/order-address";
import { normalizeDocument, normalizeClientName, isDuplicateClient, clientMatchesSearch } from "@/lib/client-dedupe";

describe("sumRevenue (lib/billing.ts)", () => {
  const base = { type: "receita" as const, status: "pago" as const, amount: new Prisma.Decimal(100), deletedAt: null as Date | null };

  it("sums only paid revenue transactions", () => {
    const rows = [
      base,
      { ...base, amount: new Prisma.Decimal(50.5) },
      { ...base, type: "despesa" as const, amount: new Prisma.Decimal(1000) }, // wrong type - excluded
      { ...base, status: "pendente" as const, amount: new Prisma.Decimal(999) }, // pending - excluded
      { ...base, amount: new Prisma.Decimal(25), deletedAt: new Date() }, // soft-deleted - excluded
    ];
    expect(sumRevenue(rows)).toBeCloseTo(150.5, 2);
  });

  it("returns 0 for an empty list", () => {
    expect(sumRevenue([])).toBe(0);
  });
});

describe("displayOrderStatus / orderStatusLabel (lib/order-status.ts)", () => {
  it("shows 'cancelado' whenever cancelledAt is set, regardless of the underlying status", () => {
    expect(displayOrderStatus({ status: "realizado", cancelledAt: new Date() })).toBe("cancelado");
    expect(orderStatusLabel({ status: "realizado", cancelledAt: new Date() })).toBe("Cancelado");
  });

  it("passes through agendado/realizado when not cancelled", () => {
    expect(displayOrderStatus({ status: "agendado", cancelledAt: null })).toBe("agendado");
    expect(displayOrderStatus({ status: "realizado", cancelledAt: null })).toBe("realizado");
  });

  it("falls back to 'agendado' for an unexpected/legacy status value", () => {
    expect(displayOrderStatus({ status: "algo-invalido", cancelledAt: null })).toBe("agendado");
  });
});

describe("client/order address helpers", () => {
  it("hasStructuredClientAddress requires all 5 fields", () => {
    expect(hasStructuredClientAddress({ addressStreet: "Rua A", addressNumber: "1", addressNeighborhood: "Centro", addressCity: "Vitória", addressState: "ES" })).toBe(true);
    expect(hasStructuredClientAddress({ addressStreet: "Rua A" })).toBe(false);
  });

  it("formatClientAddressLine composes street+number, neighborhood, city/state and reference", () => {
    const line = formatClientAddressLine({ addressStreet: "Rua das Acácias", addressNumber: "123", addressNeighborhood: "Centro", addressCity: "Vitória", addressState: "ES", addressReference: "Perto do mercado" });
    expect(line).toBe("Rua das Acácias, 123 - Centro - Vitória/ES - Ref.: Perto do mercado");
  });

  it("formatOrderAddressLine omits missing parts gracefully", () => {
    expect(formatOrderAddressLine({ addressStreet: "Av. Central" })).toBe("Av. Central");
  });

  it("orderAddressSnapshot normalizes undefined to null for every field", () => {
    const snap = orderAddressSnapshot({ addressStreet: "Rua X" });
    expect(snap).toEqual({ addressZip: null, addressStreet: "Rua X", addressNumber: null, addressNeighborhood: null, addressCity: null, addressState: null, addressReference: null });
  });

  it("evaluateClientAddress distinguishes ok/incomplete/missing", () => {
    const full = { addressStreet: "R", addressNumber: "1", addressNeighborhood: "B", addressCity: "C", addressState: "ES" };
    expect(evaluateClientAddress(full)).toBe("ok");
    expect(evaluateClientAddress({ addressStreet: "R" })).toBe("incomplete");
    expect(evaluateClientAddress({})).toBe("missing");
  });

  it("missingAddressFieldLabels lists only the absent required fields, in fixed order", () => {
    expect(missingAddressFieldLabels({ addressStreet: "R", addressCity: "C" })).toEqual(["Numero", "Bairro", "Estado/UF"]);
  });

  it("clientAddressErrorMessage names the client and the missing fields when address is incomplete", () => {
    const msg = clientAddressErrorMessage("incomplete", { addressStreet: "R", name: "Fulano" });
    expect(msg).toContain("Fulano");
    expect(msg).toContain("Numero");
  });

  it("clientAddressErrorMessage falls back to the generic 'missing' message with no client", () => {
    expect(clientAddressErrorMessage("missing", null)).toMatch(/nao possui endereco cadastrado/i);
  });
});

describe("client dedupe rules (lib/client-dedupe.ts)", () => {
  it("normalizeDocument strips all non-digit characters", () => {
    expect(normalizeDocument("123.456.789-00")).toBe("12345678900");
    expect(normalizeDocument("11.222.333/0001-81")).toBe("11222333000181");
    expect(normalizeDocument(null)).toBe("");
  });

  it("normalizeClientName trims, collapses whitespace and lowercases (pt-BR)", () => {
    expect(normalizeClientName("  João   da Silva  ")).toBe("joão da silva");
  });

  it("flags a collision only for SAME document AND SAME normalized name", () => {
    const candidate = { name: "João da Silva", document: "123.456.789-00" };
    expect(isDuplicateClient({ name: "  joão   DA silva ", document: "12345678900" }, candidate)).toBe(true);
    expect(isDuplicateClient({ name: "Outro Nome", document: "12345678900" }, candidate)).toBe(false);
  });

  it("never flags a collision when the incoming client has no document", () => {
    expect(isDuplicateClient({ name: "João da Silva", document: null }, { name: "João da Silva", document: "123.456.789-00" })).toBe(false);
  });

  // Achado: normalizeClientName só faz trim/collapse de espaços e lowercase -
  // NÃO remove acentos. "Joao" e "João" são tratados como nomes DIFERENTES
  // pela regra de dedupe hoje. Documentando o comportamento atual (não é uma
  // asserção de que está correto) - ver RELATORIO-AUDITORIA.md, item "precisa
  // de decisão": um cliente pode ser recadastrado com o mesmo documento só
  // digitando o nome sem acento.
  it("[gap conhecido] NÃO reconhece 'Joao' e 'João' como o mesmo nome (sem normalização de acentos)", () => {
    expect(isDuplicateClient({ name: "Joao da Silva", document: "12345678900" }, { name: "João da Silva", document: "123.456.789-00" })).toBe(false);
  });

  it("clientMatchesSearch matches by name substring or by document digits, ignoring punctuation", () => {
    const client = { name: "Mariana Alencar Costa", document: "45.678.901/0001-23" };
    expect(clientMatchesSearch(client, "alencar")).toBe(true);
    expect(clientMatchesSearch(client, "45678901000123")).toBe(true);
    expect(clientMatchesSearch(client, "999")).toBe(false);
    expect(clientMatchesSearch(client, "")).toBe(true);
  });
});
