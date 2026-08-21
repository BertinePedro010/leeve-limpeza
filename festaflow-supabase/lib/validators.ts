import { z } from "zod";

const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);
export const clientSchema = z.object({ branchId: z.string().uuid().optional(), name: z.string().min(2), email: z.preprocess(emptyToUndefined, z.string().email().optional().nullable()), phone: z.string().optional().nullable(), document: z.preprocess(emptyToUndefined, z.string().optional().nullable()), address: z.string().optional().nullable(), notes: z.string().optional().nullable() });
export const employeeSchema = z.object({ branchId: z.string().uuid().optional(), name: z.string().min(2), role: z.string().min(2), phone: z.string().optional().nullable(), dailyRate: z.coerce.number().nonnegative(), paymentType: z.string().default("diaria"), notes: z.string().optional().nullable() });
export const serviceSchema = z.object({ branchId: z.string().uuid().optional(), name: z.string().min(2), description: z.string().optional().nullable(), price: z.coerce.number().nonnegative(), durationHours: z.coerce.number().nonnegative(), category: z.string().min(2), active: z.coerce.boolean().default(true) });
export const transactionSchema = z.object({ branchId: z.string().uuid().optional(), type: z.enum(["receita", "despesa"]), category: z.string().min(2), description: z.string().min(2), amount: z.coerce.number().nonnegative(), dueDate: z.coerce.date(), paidAt: z.coerce.date().optional().nullable(), status: z.enum(["pago", "pendente"]), orderId: z.string().uuid().optional().nullable() });
export const orderItemSchema = z.object({ serviceId: z.string().uuid(), quantity: z.coerce.number().int().positive(), unitPrice: z.coerce.number().nonnegative() });
export const paymentMethodEnum = z.enum(["pix", "credit_card", "debit_card", "cash"]);
// paymentMethodLegacy (free text) is intentionally NOT accepted here - it is
// only ever read for pre-existing records, never written by new/edited orders.
export const orderSchema = z.object({ branchId: z.string().uuid().optional(), clientId: z.string().uuid(), eventDate: z.coerce.date(), startTime: z.string().min(1), endTime: z.string().min(1), location: z.string().min(2), status: z.enum(["pendente", "confirmado", "em_andamento", "finalizado", "cancelado"]), paymentMethod: z.preprocess((v) => (v === "" ? undefined : v), paymentMethodEnum.optional().nullable()), notes: z.string().optional().nullable(), signatureName: z.string().optional().nullable(), signatureDate: z.coerce.date().optional().nullable(), employeeIds: z.array(z.string().uuid()).default([]), items: z.array(orderItemSchema).min(1), dates: z.array(z.coerce.date()).optional() });

export const appointmentStatusEnum = z.enum(["pendente", "confirmado", "em_andamento", "finalizado", "cancelado"]);
export const appointmentCreateSchema = z.object({ orderId: z.string().uuid(), employeeId: z.string().uuid().optional().nullable(), dates: z.array(z.coerce.date()).min(1), startTime: z.string().min(1), endTime: z.string().min(1), notes: z.string().optional().nullable() });
export const appointmentUpdateSchema = z.object({ employeeId: z.string().uuid().optional().nullable(), date: z.coerce.date().optional(), startTime: z.string().min(1).optional(), endTime: z.string().min(1).optional(), status: appointmentStatusEnum.optional(), notes: z.string().optional().nullable() });
export const appointmentCancelSchema = z.object({ reason: z.string().min(3) });

export const recurringScheduleSchema = z.object({
  branchId: z.string().uuid().optional(),
  clientId: z.string().uuid(),
  serviceId: z.string().uuid(),
  frequency: z.enum(["weekly", "monthly"]),
  interval: z.coerce.number().int().positive().default(1),
  dayOfWeek: z.coerce.number().int().min(0).max(6).optional().nullable(),
  dayOfMonth: z.coerce.number().int().min(1).max(31).optional().nullable(),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  price: z.coerce.number().nonnegative(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional().nullable(),
  location: z.string().min(2),
  employeeIds: z.array(z.string().uuid()).default([]),
});

export const branchSchema = z.object({ name: z.string().min(2), city: z.string().min(2), state: z.string().length(2), active: z.coerce.boolean().default(true) });

// Keep in sync with ModuleName in lib/authz.ts.
export const moduleNameEnum = z.enum(["clients", "employees", "services", "orders", "calendar", "finance", "reports"]);
export const userRoleEnum = z.enum(["admin", "operador", "funcionario"]);
export const userCreateSchema = z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(8), role: userRoleEnum, branchIds: z.array(z.string().uuid()).default([]), allowedModules: z.array(moduleNameEnum).default([]) });
// `active` deliberately uses z.boolean(), NOT z.coerce.boolean() - coerce is
// just Boolean(value) under the hood, so a direct API call sending the
// string "false" would coerce to true and silently keep/reactivate an
// account the caller intended to deactivate. This schema is the actual
// trust boundary for this endpoint (the shipped UI always sends a real
// boolean, so this only matters for a caller bypassing the UI).
export const userUpdateSchema = z.object({ name: z.string().min(2), role: userRoleEnum, active: z.boolean(), branchIds: z.array(z.string().uuid()).default([]), allowedModules: z.array(moduleNameEnum).default([]) });
export const userResetPasswordSchema = z.object({ password: z.string().min(8) });