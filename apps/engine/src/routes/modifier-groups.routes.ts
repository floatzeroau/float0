import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/require-auth.js';
import { requireRole } from '../middleware/rbac.js';
import {
  listModifierGroups,
  getModifierGroup,
  createModifierGroup,
  updateModifierGroup,
  deleteModifierGroup,
  linkModifierGroupToProduct,
  unlinkModifierGroupFromProduct,
} from './modifier-groups.service.js';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const createSchema = z
  .object({
    name: z.string().min(1).max(255),
    displayName: z.string().max(255).nullable().optional(),
    selectionType: z.enum(['single', 'multiple']).optional(),
    minSelections: z.number().int().min(0).optional(),
    maxSelections: z.number().int().min(1).optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .refine(
    (data) => {
      if (data.minSelections !== undefined && data.maxSelections !== undefined) {
        return data.maxSelections >= data.minSelections;
      }
      return true;
    },
    { message: 'maxSelections must be >= minSelections', path: ['maxSelections'] },
  );

const updateSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    displayName: z.string().max(255).nullable().optional(),
    selectionType: z.enum(['single', 'multiple']).optional(),
    minSelections: z.number().int().min(0).optional(),
    maxSelections: z.number().int().min(1).optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .refine(
    (data) => {
      if (data.minSelections !== undefined && data.maxSelections !== undefined) {
        return data.maxSelections >= data.minSelections;
      }
      return true;
    },
    { message: 'maxSelections must be >= minSelections', path: ['maxSelections'] },
  );

const idParamSchema = z.object({
  id: z.string().uuid(),
});

const linkSchema = z.object({
  modifierGroupId: z.string().uuid(),
  sortOrder: z.number().int().min(0).optional(),
});

const productGroupParamSchema = z.object({
  productId: z.string().uuid(),
  groupId: z.string().uuid(),
});

const productParamSchema = z.object({
  productId: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function modifierGroupRoutes(app: FastifyInstance) {
  // LIST
  app.get('/modifier-groups', { preHandler: [requireAuth] }, async (request, reply) => {
    const rows = await listModifierGroups(request.user.orgId);
    return reply.send(rows);
  });

  // GET ONE (with modifiers)
  app.get('/modifier-groups/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        statusCode: 400,
        details: params.error.flatten().fieldErrors,
      });
    }

    const group = await getModifierGroup(request.user.orgId, params.data.id);
    if (!group) {
      return reply.status(404).send({ error: 'Modifier group not found', statusCode: 404 });
    }

    return reply.send(group);
  });

  // CREATE
  app.post(
    '/modifier-groups',
    { preHandler: [requireAuth, requireRole('manager')] },
    async (request, reply) => {
      const parsed = createSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          statusCode: 400,
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const created = await createModifierGroup(request.user.orgId, parsed.data, {
        orgId: request.user.orgId,
        userId: request.user.userId,
        ip: request.ip,
      });

      return reply.status(201).send(created);
    },
  );

  // UPDATE
  app.put(
    '/modifier-groups/:id',
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

      const updated = await updateModifierGroup(request.user.orgId, params.data.id, parsed.data, {
        orgId: request.user.orgId,
        userId: request.user.userId,
        ip: request.ip,
      });

      return reply.send(updated);
    },
  );

  // DELETE (soft)
  app.delete(
    '/modifier-groups/:id',
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

      await deleteModifierGroup(request.user.orgId, params.data.id, {
        orgId: request.user.orgId,
        userId: request.user.userId,
        ip: request.ip,
      });

      return reply.send({ ok: true });
    },
  );

  // LINK modifier group to product
  app.post(
    '/products/:productId/modifier-groups',
    { preHandler: [requireAuth, requireRole('manager')] },
    async (request, reply) => {
      const params = productParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          statusCode: 400,
          details: params.error.flatten().fieldErrors,
        });
      }

      const parsed = linkSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          statusCode: 400,
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const created = await linkModifierGroupToProduct(
        request.user.orgId,
        params.data.productId,
        parsed.data,
        {
          orgId: request.user.orgId,
          userId: request.user.userId,
          ip: request.ip,
        },
      );

      return reply.status(201).send(created);
    },
  );

  // UNLINK modifier group from product
  app.delete(
    '/products/:productId/modifier-groups/:groupId',
    { preHandler: [requireAuth, requireRole('manager')] },
    async (request, reply) => {
      const params = productGroupParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          statusCode: 400,
          details: params.error.flatten().fieldErrors,
        });
      }

      await unlinkModifierGroupFromProduct(
        request.user.orgId,
        params.data.productId,
        params.data.groupId,
        {
          orgId: request.user.orgId,
          userId: request.user.userId,
          ip: request.ip,
        },
      );

      return reply.send({ ok: true });
    },
  );
}
