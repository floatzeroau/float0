import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/require-auth.js';
import { requireRole } from '../middleware/rbac.js';
import {
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
} from './categories.service.js';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const createSchema = z.object({
  name: z.string().min(1).max(255),
  colour: z.string().max(50).nullable().optional(),
  icon: z.string().max(100).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  parentId: z.string().uuid().nullable().optional(),
});

const updateSchema = createSchema.partial();

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

const parentIdQuerySchema = z.object({
  parentId: z.string().uuid().optional(),
});

const idParamSchema = z.object({
  id: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function categoryRoutes(app: FastifyInstance) {
  // LIST
  app.get('/categories', { preHandler: [requireAuth] }, async (request, reply) => {
    const query = parentIdQuerySchema.safeParse(request.query);
    const parentId = query.success ? query.data.parentId : undefined;

    const rows = await listCategories(request.user.orgId, parentId);
    return reply.send(rows);
  });

  // GET ONE
  app.get('/categories/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        statusCode: 400,
        details: params.error.flatten().fieldErrors,
      });
    }

    const category = await getCategory(request.user.orgId, params.data.id);
    if (!category) {
      return reply.status(404).send({ error: 'Category not found', statusCode: 404 });
    }

    return reply.send(category);
  });

  // CREATE
  app.post(
    '/categories',
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

      const created = await createCategory(request.user.orgId, parsed.data, {
        orgId: request.user.orgId,
        userId: request.user.userId,
        ip: request.ip,
      });

      return reply.status(201).send(created);
    },
  );

  // UPDATE
  app.put(
    '/categories/:id',
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

      const updated = await updateCategory(request.user.orgId, params.data.id, parsed.data, {
        orgId: request.user.orgId,
        userId: request.user.userId,
        ip: request.ip,
      });

      return reply.send(updated);
    },
  );

  // DELETE (soft)
  app.delete(
    '/categories/:id',
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

      await deleteCategory(request.user.orgId, params.data.id, {
        orgId: request.user.orgId,
        userId: request.user.userId,
        ip: request.ip,
      });

      return reply.send({ ok: true });
    },
  );

  // REORDER
  app.patch(
    '/categories/reorder',
    { preHandler: [requireAuth, requireRole('manager')] },
    async (request, reply) => {
      const parsed = reorderSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          statusCode: 400,
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const result = await reorderCategories(request.user.orgId, parsed.data.items, {
        orgId: request.user.orgId,
        userId: request.user.userId,
        ip: request.ip,
      });

      return reply.send(result);
    },
  );
}
