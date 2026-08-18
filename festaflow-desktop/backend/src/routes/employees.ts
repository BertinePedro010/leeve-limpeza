import { Router } from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import { requireAuth, requireRole } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { asyncHandler } from "../utils/asyncHandler";
import { createEmployee, deleteEmployee, listEmployees, updateEmployee } from "../controllers/employeesController";

const router = Router();
const schema = z.object({ nome: z.string().min(2), cargo: z.string().min(2), telefone: z.string().optional().nullable(), valorDiaria: z.coerce.number().nonnegative(), tipoPagamento: z.string().default("diaria"), observacoes: z.string().optional().nullable() });

router.use(requireAuth);
router.get("/", asyncHandler(listEmployees));
router.post("/", requireRole(Role.ADMIN, Role.OPERADOR), validate(schema), asyncHandler(createEmployee));
router.put("/:id", requireRole(Role.ADMIN, Role.OPERADOR), validate(schema), asyncHandler(updateEmployee));
router.delete("/:id", requireRole(Role.ADMIN), asyncHandler(deleteEmployee));

export default router;
