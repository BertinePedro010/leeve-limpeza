import { Router } from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import { requireAuth, requireRole } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { asyncHandler } from "../utils/asyncHandler";
import { createClient, deleteClient, listClients, updateClient } from "../controllers/clientsController";

const router = Router();
const schema = z.object({ nome: z.string().min(2), email: z.string().email().optional().nullable(), telefone: z.string().optional().nullable(), documento: z.string().optional().nullable(), endereco: z.string().optional().nullable(), observacoes: z.string().optional().nullable() });

router.use(requireAuth);
router.get("/", asyncHandler(listClients));
router.post("/", requireRole(Role.ADMIN, Role.OPERADOR), validate(schema), asyncHandler(createClient));
router.put("/:id", requireRole(Role.ADMIN, Role.OPERADOR), validate(schema), asyncHandler(updateClient));
router.delete("/:id", requireRole(Role.ADMIN), asyncHandler(deleteClient));

export default router;
