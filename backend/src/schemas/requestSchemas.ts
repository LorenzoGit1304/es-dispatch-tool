import { z } from "zod";

const roleSchema = z.enum(["ES", "AS", "ADMIN"]);
const statusSchema = z.enum(["AVAILABLE", "BUSY", "UNAVAILABLE"]);
const enrollmentStatusSchema = z.enum(["WAITING", "ASSIGNED", "COMPLETED"]);

export const enrollmentCreateSchema = z.object({
  premise_id: z.string().min(1),
  requested_by: z.number().int().positive(),
  timeslot: z.string().min(1),
});

export const userCreateSchema = z.object({
  name: z.string().min(1),
  role: roleSchema,
  status: statusSchema,
});

export const userUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  role: roleSchema.optional(),
  status: statusSchema.optional(),
});

export const userStatusUpdateSchema = z.object({
  status: statusSchema,
});

export const userSyncSchema = z.object({
  clerk_id: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1),
});

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const enrollmentListQuerySchema = paginationQuerySchema.extend({
  status: enrollmentStatusSchema.optional(),
});
