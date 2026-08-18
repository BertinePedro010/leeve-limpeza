import { Router } from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import { requireAuth, requireRole } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { asyncHandler } from "../utils/asyncHandler";
import { createService, deleteService, listServices, updateService } from "../controllers/servicesController";

const router = Router();
const schema = z.object({ nome: z.string().min(2), descricao: z.string().optional().nullable(), valor: z.coerce.number().nonnegative(), duracaoHoras: z.coerce.number().nonnegative(), categoria: z.string().min(2), status: z.string().default("ativo") });

router.use(requireAuth);
router.get("/", asyncHandler(listServices));
router.post("/", requireRole(Role.ADMIN, Role.OPERADOR), validate(schema), asyncHandler(createService));
router.put("/:id", requireRole(Role.ADMIN, Role.OPERADOR), validate(schema), asyncHandler(updateService));
router.delete("/:id", requireRole(Role.ADMIN), asyncHandler(deleteService));

export default router;
