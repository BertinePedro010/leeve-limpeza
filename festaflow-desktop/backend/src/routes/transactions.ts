import { Router } from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import { requireAuth, requireRole } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { asyncHandler } from "../utils/asyncHandler";
import { createTransaction, deleteTransaction, listTransactions, updateTransaction } from "../controllers/transactionsController";

const router = Router();
const schema = z.object({ tipo: z.enum(["receita", "despesa"]), categoria: z.string().min(2), descricao: z.string().min(2), valor: z.coerce.number().nonnegative(), data: z.coerce.date(), status: z.enum(["pago", "pendente"]), osId: z.string().optional().nullable() });

router.use(requireAuth);
router.get("/", asyncHandler(listTransactions));
router.post("/", requireRole(Role.ADMIN, Role.OPERADOR), validate(schema), asyncHandler(createTransaction));
router.put("/:id", requireRole(Role.ADMIN, Role.OPERADOR), validate(schema), asyncHandler(updateTransaction));
router.delete("/:id", requireRole(Role.ADMIN), asyncHandler(deleteTransaction));

export default router;
