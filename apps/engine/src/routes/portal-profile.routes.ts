import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireCustomerAuth } from '../middleware/require-customer-auth.js';
import { getCustomerProfile, updateCustomerProfile } from './portal-auth.service.js';
import {
  listCustomerBalances,
  portalPurchasePack,
  listTransactionHistory,
} from './customer-balances.service.js';

const updateProfileSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional(),
});

const purchasePackSchema = z.object({
  packId: z.string().uuid(),
});

export async function portalProfileRoutes(app: FastifyInstance) {
  // GET /portal/:slug/me
  app.get('/portal/:slug/me', { preHandler: [requireCustomerAuth] }, async (request, reply) => {
    const profile = await getCustomerProfile(request.customerId!);
    return reply.send(profile);
  });

  // PUT /portal/:slug/me
  app.put('/portal/:slug/me', { preHandler: [requireCustomerAuth] }, async (request, reply) => {
    const parsed = updateProfileSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        statusCode: 400,
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const profile = await updateCustomerProfile(request.customerId!, parsed.data);
    return reply.send(profile);
  });

  // GET /portal/:slug/me/balances
  app.get(
    '/portal/:slug/me/balances',
    { preHandler: [requireCustomerAuth] },
    async (request, reply) => {
      const balances = await listCustomerBalances(request.customerId!);
      return reply.send(balances);
    },
  );

  // POST /portal/:slug/me/balances/purchase
  app.post(
    '/portal/:slug/me/balances/purchase',
    { preHandler: [requireCustomerAuth] },
    async (request, reply) => {
      const parsed = purchasePackSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          statusCode: 400,
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const result = await portalPurchasePack(
        request.customerId!,
        request.orgId!,
        parsed.data.packId,
      );
      return reply.status(201).send(result);
    },
  );

  // GET /portal/:slug/me/balances/history
  app.get(
    '/portal/:slug/me/balances/history',
    { preHandler: [requireCustomerAuth] },
    async (request, reply) => {
      const txns = await listTransactionHistory(request.customerId!);
      return reply.send(txns);
    },
  );
}
