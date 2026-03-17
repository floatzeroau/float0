import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/require-auth.js';
import { requireRole } from '../middleware/rbac.js';
import {
  listModifiers,
  createModifier,
  updateModifier,
  deleteModifier,
  reorderModifiers,
} from './modifiers.service.js';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const groupIdParamSchema = z.object({
  groupId: z.string().uuid(),
});

const idParamSchema = z.object({
  id: z.string().uuid(),
});

const createSchema = z.object({
  name: z.string().min(1).max(255),
  priceAdjustment: z.number().optional(),
  isDefault: z.boolean().optional(),
  isAvailable: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  priceAdjustment: z.number().optional(),
  isDefault: z.boolean().optional(),
  isAvailable: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const reorderSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        sortOrder: z.number().int().min(0),
      }),
    )
    .min(1),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function modifierRoutes(app: FastifyInstance) {
  // LIST modifiers in a group
  app.get(
    '/modifier-groups/:groupId/modifiers',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const params = groupIdParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          statusCode: 400,
          details: params.error.flatten().fieldErrors,
        });
      }

      const rows = await listModifiers(request.user.orgId, params.data.groupId);
      return reply.send(rows);
    },
  );

  // CREATE modifier in a group
  app.post(
    '/modifier-groups/:groupId/modifiers',
    { preHandler: [requireAuth, requireRole('manager')] },
    async (request, reply) => {
      const params = groupIdParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          statusCode: 400,
          details: params.error.flatten().fieldErrors,
        });
      }

      const parsed = createSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          statusCode: 400,
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const created = await createModifier(request.user.orgId, params.data.groupId, parsed.data, {
        orgId: request.user.orgId,
        userId: request.user.userId,
        ip: request.ip,
      });

      return reply.status(201).send(created);
    },
  );

  // UPDATE modifier
  app.put(
    '/modifiers/:id',
    { preHandler: [requireAuth, requireRole('manager')] },
    async (request, reply) => {
      const params = idParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          statusCode: 400,
          details: params.error.flatten().fieldErrors,
        });
      }

      const parsed = updateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          statusCode: 400,
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const updated = await updateModifier(request.user.orgId, params.data.id, parsed.data, {
        orgId: request.user.orgId,
        userId: request.user.userId,
        ip: request.ip,
      });

      return reply.send(updated);
    },
  );

  // DELETE modifier (soft)
  app.delete(
    '/modifiers/:id',
    { preHandler: [requireAuth, requireRole('admin')] },
    async (request, reply) => {
      const params = idParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          statusCode: 400,
          details: params.error.flatten().fieldErrors,
        });
      }

      await deleteModifier(request.user.orgId, params.data.id, {
        orgId: request.user.orgId,
        userId: request.user.userId,
        ip: request.ip,
      });

      return reply.send({ ok: true });
    },
  );

  // REORDER modifiers in a group
  app.patch(
    '/modifier-groups/:groupId/modifiers/reorder',
    { preHandler: [requireAuth, requireRole('manager')] },
    async (request, reply) => {
      const params = groupIdParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          statusCode: 400,
          details: params.error.flatten().fieldErrors,
        });
      }

      const parsed = reorderSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          statusCode: 400,
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const result = await reorderModifiers(
        request.user.orgId,
        params.data.groupId,
        parsed.data.items,
        {
          orgId: request.user.orgId,
          userId: request.user.userId,
          ip: request.ip,
        },
      );

      return reply.send(result);
    },
  );
}
