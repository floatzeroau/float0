import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/require-auth.js';
import { requireRole } from '../middleware/rbac.js';
import {
  listCustomerBalances,
  purchasePack,
  redeemBalance,
  adjustBalance,
} from './customer-balances.service.js';

const customerIdParam = z.object({
  id: z.string().uuid(),
});

const purchaseSchema = z.object({
  packId: z.string().uuid(),
  customCount: z.number().int().min(1).optional(),
  discountType: z.enum(['percentage', 'fixed']).nullable().optional(),
  discountValue: z.number().min(0).nullable().optional(),
  staffId: z.string().uuid().optional(),
});

const redeemSchema = z.object({
  customerBalanceId: z.string().uuid(),
  quantity: z.number().int().min(1).optional(),
  orderId: z.string().uuid().optional(),
});

const adjustSchema = z.object({
  customerBalanceId: z.string().uuid(),
  quantity: z.number().int(),
  reason: z.string().max(1000).optional(),
});

export async function customerBalanceRoutes(app: FastifyInstance) {
  // GET /customers/:id/balances
  app.get('/customers/:id/balances', { preHandler: [requireAuth] }, async (request, reply) => {
    const params = customerIdParam.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'Invalid customer ID', statusCode: 400 });
    }

    const balances = await listCustomerBalances(params.data.id);
    return reply.send(balances);
  });

  // POST /customers/:id/balances/purchase
  app.post(
    '/customers/:id/balances/purchase',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const params = customerIdParam.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ error: 'Invalid customer ID', statusCode: 400 });
      }

      const parsed = purchaseSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          statusCode: 400,
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const result = await purchasePack(params.data.id, request.user.orgId, parsed.data);
      return reply.status(201).send(result);
    },
  );

  // POST /customers/:id/balances/redeem
  app.post(
    '/customers/:id/balances/redeem',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const params = customerIdParam.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ error: 'Invalid customer ID', statusCode: 400 });
      }

      const parsed = redeemSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          statusCode: 400,
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const result = await redeemBalance(params.data.id, parsed.data);
      return reply.send(result);
    },
  );

  // POST /customers/:id/balances/adjust
  app.post(
    '/customers/:id/balances/adjust',
    { preHandler: [requireAuth, requireRole('admin')] },
    async (request, reply) => {
      const params = customerIdParam.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ error: 'Invalid customer ID', statusCode: 400 });
      }

      const parsed = adjustSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          statusCode: 400,
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const result = await adjustBalance(params.data.id, {
        ...parsed.data,
        staffId: request.user.userId,
      });
      return reply.send(result);
    },
  );
}
