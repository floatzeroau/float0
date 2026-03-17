import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/require-auth.js';
import { requireRole } from '../middleware/rbac.js';
import {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  duplicateProduct,
  toggleAvailability,
} from './products.service.js';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const idParamSchema = z.object({
  id: z.string().uuid(),
});

const listQuerySchema = z.object({
  categoryId: z.string().uuid().optional(),
  isAvailable: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  search: z.string().max(255).optional(),
  sortBy: z.enum(['name', 'basePrice', 'sortOrder', 'createdAt']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  limit: z.string().transform(Number).pipe(z.number().int().min(1).max(200)).optional(),
  offset: z.string().transform(Number).pipe(z.number().int().min(0)).optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).nullable().optional(),
  categoryId: z.string().uuid(),
  basePrice: z.number().min(0),
  sku: z.string().max(100).nullable().optional(),
  barcode: z.string().max(255).nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  isAvailable: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  categoryId: z.string().uuid().optional(),
  basePrice: z.number().min(0).optional(),
  sku: z.string().max(100).nullable().optional(),
  barcode: z.string().max(255).nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  isAvailable: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function productRoutes(app: FastifyInstance) {
  // LIST
  app.get('/products', { preHandler: [requireAuth] }, async (request, reply) => {
    const query = listQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        statusCode: 400,
        details: query.error.flatten().fieldErrors,
      });
    }

    const result = await listProducts(request.user.orgId, query.data);
    return reply.send(result);
  });

  // GET ONE (with category + modifier groups + modifiers)
  app.get('/products/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        statusCode: 400,
        details: params.error.flatten().fieldErrors,
      });
    }

    const product = await getProduct(request.user.orgId, params.data.id);
    if (!product) {
      return reply.status(404).send({ error: 'Product not found', statusCode: 404 });
    }

    return reply.send(product);
  });

  // CREATE
  app.post(
    '/products',
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

      const created = await createProduct(request.user.orgId, parsed.data, {
        orgId: request.user.orgId,
        userId: request.user.userId,
        ip: request.ip,
      });

      return reply.status(201).send(created);
    },
  );

  // UPDATE
  app.put(
    '/products/:id',
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

      const updated = await updateProduct(request.user.orgId, params.data.id, parsed.data, {
        orgId: request.user.orgId,
        userId: request.user.userId,
        ip: request.ip,
      });

      return reply.send(updated);
    },
  );

  // DELETE (soft, with order_items check)
  app.delete(
    '/products/:id',
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

      await deleteProduct(request.user.orgId, params.data.id, {
        orgId: request.user.orgId,
        userId: request.user.userId,
        ip: request.ip,
      });

      return reply.send({ ok: true });
    },
  );

  // DUPLICATE
  app.post(
    '/products/:id/duplicate',
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

      const created = await duplicateProduct(request.user.orgId, params.data.id, {
        orgId: request.user.orgId,
        userId: request.user.userId,
        ip: request.ip,
      });

      return reply.status(201).send(created);
    },
  );

  // TOGGLE AVAILABILITY (86 button)
  app.patch(
    '/products/:id/availability',
    { preHandler: [requireAuth, requireRole('staff')] },
    async (request, reply) => {
      const params = idParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          statusCode: 400,
          details: params.error.flatten().fieldErrors,
        });
      }

      const updated = await toggleAvailability(request.user.orgId, params.data.id, {
        orgId: request.user.orgId,
        userId: request.user.userId,
        ip: request.ip,
      });

      return reply.send(updated);
    },
  );
}
