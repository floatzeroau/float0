import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/require-auth.js';
import { requireRole } from '../middleware/rbac.js';
import {
  listCustomerPacks,
  createPack,
  servePack,
  refundPack,
  adjustPack,
  listPackHistory,
} from './packs.service.js';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const customerIdParam = z.object({
  id: z.string().uuid(),
});

const packIdParam = z.object({
  id: z.string().uuid(),
  packId: z.string().uuid(),
});

const listQuerySchema = z.object({
  status: z.enum(['active', 'expired', 'consumed', 'refunded']).optional(),
});

const createSchema = z.object({
  productId: z.string().uuid(),
  productSnapshot: z.record(z.unknown()),
  totalQuantity: z.number().int().min(1),
  pricePaid: z.number().min(0),
  sourceOrderId: z.string().uuid().optional(),
  expiryDate: z.string().datetime().optional(),
});

const serveSchema = z.object({
  quantityServed: z.number().int().min(1).optional(),
  terminalId: z.string().optional(),
});

const adjustSchema = z.object({
  quantityDelta: z.number().int(),
  reason: z.string().min(1),
});

const historyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function packRoutes(app: FastifyInstance) {
  // GET /customers/:id/packs
  app.get('/customers/:id/packs', { preHandler: [requireAuth] }, async (request, reply) => {
    const params = customerIdParam.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'Invalid customer ID', statusCode: 400 });
    }

    const query = listQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({
        error: 'Invalid query parameters',
        statusCode: 400,
        details: query.error.flatten().fieldErrors,
      });
    }

    const result = await listCustomerPacks(request.user.orgId, params.data.id, query.data.status);
    return reply.send(result);
  });

  // GET /customers/:id/packs/history
  app.get('/customers/:id/packs/history', { preHandler: [requireAuth] }, async (request, reply) => {
    const params = customerIdParam.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'Invalid customer ID', statusCode: 400 });
    }

    const query = historyQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({
        error: 'Invalid query parameters',
        statusCode: 400,
        details: query.error.flatten().fieldErrors,
      });
    }

    const result = await listPackHistory(request.user.orgId, params.data.id, query.data);
    return reply.send(result);
  });

  // POST /customers/:id/packs
  app.post('/customers/:id/packs', { preHandler: [requireAuth] }, async (request, reply) => {
    const params = customerIdParam.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'Invalid customer ID', statusCode: 400 });
    }

    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        statusCode: 400,
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const pack = await createPack(
      request.user.orgId,
      params.data.id,
      parsed.data,
      request.user.userId,
    );
    return reply.status(201).send(pack);
  });

  // POST /customers/:id/packs/:packId/serve
  app.post(
    '/customers/:id/packs/:packId/serve',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const params = packIdParam.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ error: 'Invalid parameters', statusCode: 400 });
      }

      const parsed = serveSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          statusCode: 400,
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const result = await servePack(
        request.user.orgId,
        params.data.id,
        params.data.packId,
        parsed.data,
        request.user.userId,
      );
      return reply.send(result);
    },
  );

  // POST /customers/:id/packs/:packId/refund
  app.post(
    '/customers/:id/packs/:packId/refund',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const params = packIdParam.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ error: 'Invalid parameters', statusCode: 400 });
      }

      const result = await refundPack(
        request.user.orgId,
        params.data.id,
        params.data.packId,
        request.user.userId,
      );
      return reply.send(result);
    },
  );

  // POST /customers/:id/packs/:packId/adjust
  app.post(
    '/customers/:id/packs/:packId/adjust',
    { preHandler: [requireAuth, requireRole('manager')] },
    async (request, reply) => {
      const params = packIdParam.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ error: 'Invalid parameters', statusCode: 400 });
      }

      const parsed = adjustSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          statusCode: 400,
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const result = await adjustPack(
        request.user.orgId,
        params.data.id,
        params.data.packId,
        parsed.data,
        request.user.userId,
      );
      return reply.send(result);
    },
  );
}
