import { describe, it, expect } from "vitest";
import { clientSchema, orderSchema, transactionSchema, recurringScheduleSchema, orderItemSchema, orderValidationError, clientValidationError } from "@/lib/validators";

const uuid = "11111111-1111-1111-1111-111111111111";

describe("clientSchema", () => {
  const validClient = { name: "João da Silva", addressStreet: "Rua A", addressNumber: "1", addressNeighborhood: "Centro", addressCity: "Vitória", addressState: "ES" };

  it("accepts a minimal valid client (document/email/phone are optional)", () => {
    expect(clientSchema.safeParse(validClient).success).toBe(true);
  });

  it("rejects a missing/short name", () => {
    expect(clientSchema.safeParse({ ...validClient, name: "A" }).success).toBe(false);
  });

  it("rejects a malformed email but accepts an empty string as 'not provided'", () => {
    expect(clientSchema.safeParse({ ...validClient, email: "not-an-email" }).success).toBe(false);
    expect(clientSchema.safeParse({ ...validClient, email: "" }).success).toBe(true);
  });

  it("requires the address state to be exactly 2 characters (UF)", () => {
    expect(clientSchema.safeParse({ ...validClient, addressState: "Espírito Santo" }).success).toBe(false);
    expect(clientSchema.safeParse({ ...validClient, addressState: "ES" }).success).toBe(true);
  });

  // Achado (ver AUDITORIA-PLANO.md / RELATORIO-AUDITORIA.md): nao ha validacao
  // de formato/digito verificador de CPF/CNPJ em nenhuma camada do servidor -
  // qualquer string passa. Documentando o comportamento atual.
  it("[gap conhecido] aceita qualquer string como 'document', sem validar formato ou dígito verificador de CPF/CNPJ", () => {
    expect(clientSchema.safeParse({ ...validClient, document: "não-é-um-cpf-nem-cnpj" }).success).toBe(true);
    expect(clientSchema.safeParse({ ...validClient, document: "000.000.000-00" }).success).toBe(true); // CPF matematicamente inválido
  });

  it("[gap conhecido] aceita qualquer string como 'phone', sem validar formato de telefone", () => {
    expect(clientSchema.safeParse({ ...validClient, phone: "abc" }).success).toBe(true);
  });
});

describe("orderItemSchema / orderSchema", () => {
  const validItem = { serviceId: uuid, quantity: 1, unitPrice: 100 };

  it("requires quantity to be a positive integer (no fractional quantities)", () => {
    expect(orderItemSchema.safeParse({ ...validItem, quantity: 0 }).success).toBe(false);
    expect(orderItemSchema.safeParse({ ...validItem, quantity: -1 }).success).toBe(false);
    expect(orderItemSchema.safeParse({ ...validItem, quantity: 1.5 }).success).toBe(false);
  });

  it("accepts unitPrice of exactly 0 (courtesy service)", () => {
    expect(orderItemSchema.safeParse({ ...validItem, unitPrice: 0 }).success).toBe(true);
  });

  it("rejects a negative unitPrice", () => {
    expect(orderItemSchema.safeParse({ ...validItem, unitPrice: -0.01 }).success).toBe(false);
  });

  it("requires at least one item on an order", () => {
    const order = { clientId: uuid, eventDate: "2026-05-01", startTime: "09:00", endTime: "10:00", status: "agendado", items: [] };
    expect(orderSchema.safeParse(order).success).toBe(false);
  });

  it("silently ignores any address fields sent by the client (server always snapshots from the client's own cadastro)", () => {
    const order = { clientId: uuid, eventDate: "2026-05-01", startTime: "09:00", endTime: "10:00", status: "agendado", items: [validItem], addressStreet: "Tentativa de forjar endereco" };
    const parsed = orderSchema.safeParse(order);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect((parsed.data as Record<string, unknown>).addressStreet).toBeUndefined();
  });
});

describe("transactionSchema", () => {
  it("accepts cents-precision amounts without rounding away decimals", () => {
    const parsed = transactionSchema.safeParse({ type: "receita", category: "Servicos", description: "Teste", amount: 312.47, dueDate: "2026-05-01", status: "pago" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.amount).toBe(312.47);
  });

  it("rejects a negative amount", () => {
    expect(transactionSchema.safeParse({ type: "despesa", category: "X", description: "Teste", amount: -1, dueDate: "2026-05-01", status: "pendente" }).success).toBe(false);
  });
});

describe("recurringScheduleSchema", () => {
  const base = { clientId: uuid, serviceId: uuid, startTime: "09:00", endTime: "10:00", price: 100, startDate: "2026-05-01" };

  it("requires at least one weekday for weekly recurrence", () => {
    expect(recurringScheduleSchema.safeParse({ ...base, frequency: "weekly", daysOfWeek: [] }).success).toBe(false);
    expect(recurringScheduleSchema.safeParse({ ...base, frequency: "weekly", daysOfWeek: [1] }).success).toBe(true);
  });

  it("requires at least one weekday for biweekly (quinzenal) recurrence too", () => {
    expect(recurringScheduleSchema.safeParse({ ...base, frequency: "biweekly", daysOfWeek: [] }).success).toBe(false);
    expect(recurringScheduleSchema.safeParse({ ...base, frequency: "biweekly", daysOfWeek: [2, 4] }).success).toBe(true);
  });

  it("does not require daysOfWeek for monthly recurrence", () => {
    expect(recurringScheduleSchema.safeParse({ ...base, frequency: "monthly", dayOfMonth: 15 }).success).toBe(true);
  });
});

describe("orderValidationError / clientValidationError field mapping", () => {
  it("maps a missing clientId to a specific, actionable message", () => {
    const result = orderSchema.safeParse({ eventDate: "2026-05-01", startTime: "09:00", endTime: "10:00", status: "agendado", items: [{ serviceId: uuid, quantity: 1, unitPrice: 10 }] });
    expect(result.success).toBe(false);
    if (!result.success) {
      const { message, field } = orderValidationError(result.error);
      expect(field).toBe("clientId");
      expect(message).toMatch(/selecione um cliente/i);
    }
  });

  it("maps an invalid item sub-field back to the 'items' section with a service-specific message", () => {
    const result = orderSchema.safeParse({ clientId: uuid, eventDate: "2026-05-01", startTime: "09:00", endTime: "10:00", status: "agendado", items: [{ serviceId: uuid, quantity: 0, unitPrice: 10 }] });
    expect(result.success).toBe(false);
    if (!result.success) {
      const { message, field } = orderValidationError(result.error);
      expect(field).toBe("items");
      expect(message).toMatch(/quantidade/i);
    }
  });

  it("maps an invalid client email to a friendly message", () => {
    const result = clientSchema.safeParse({ name: "Fulano", email: "invalido", addressStreet: "R", addressNumber: "1", addressNeighborhood: "B", addressCity: "C", addressState: "ES" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const { message, field } = clientValidationError(result.error);
      expect(field).toBe("email");
      expect(message).toMatch(/e-mail/i);
    }
  });
});
