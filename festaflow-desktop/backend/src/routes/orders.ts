import { Router } from "express";
import { z } from "zod";
import { OSStatus, Role } from "@prisma/client";
import { requireAuth, requireRole } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { asyncHandler } from "../utils/asyncHandler";
import { createOrder, deleteOrder, listOrders, updateOrder } from "../controllers/ordersController";

const router = Router();
const item = z.object({ serviceId: z.string(), quantidade: z.coerce.number().int().positive(), valorUnitario: z.coerce.number().nonnegative() });
const schema = z.object({ clienteId: z.string(), dataEvento: z.coerce.date(), horarioInicio: z.string(), horarioFim: z.string(), local: z.string().min(2), status: z.nativeEnum(OSStatus), formaPagamento: z.string().optional().nullable(), observacoes: z.string().optional().nullable(), assinaturaNome: z.string().optional().nullable(), assinaturaData: z.coerce.date().optional().nullable(), anexos: z.array(z.string()).default([]), funcionariosIds: z.array(z.string()).default([]), itens: z.array(item).min(1) });

router.use(requireAuth);
router.get("/", asyncHandler(listOrders));
router.post("/", requireRole(Role.ADMIN, Role.OPERADOR), validate(schema), asyncHandler(createOrder));
router.put("/:id", requireRole(Role.ADMIN, Role.OPERADOR), validate(schema), asyncHandler(updateOrder));
router.delete("/:id", requireRole(Role.ADMIN), asyncHandler(deleteOrder));

export default router;
