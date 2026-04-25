import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { requireCustomerAuth } from '../middleware/require-customer-auth.js';
import { getCustomerProfile, updateCustomerProfile } from './portal-auth.service.js';
import { db } from '../db/connection.js';
import { packs, packTransactions } from '../db/schema/pos.js';

const updateProfileSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional(),
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

  // GET /portal/:slug/me/packs
  app.get(
    '/portal/:slug/me/packs',
    { preHandler: [requireCustomerAuth] },
    async (request, reply) => {
      const rows = await db
        .select({
          id: packs.id,
          productId: packs.productId,
          productSnapshot: packs.productSnapshot,
          totalQuantity: packs.totalQuantity,
          remainingQuantity: packs.remainingQuantity,
          pricePaid: packs.pricePaid,
          status: packs.status,
          expiryDate: packs.expiryDate,
          purchasedAt: packs.purchasedAt,
        })
        .from(packs)
        .where(
          and(
            eq(packs.customerId, request.customerId!),
            eq(packs.organizationId, request.orgId!),
            eq(packs.status, 'active'),
          ),
        )
        .orderBy(desc(packs.purchasedAt));
      return reply.send(rows);
    },
  );

  // GET /portal/:slug/me/packs/history
  app.get(
    '/portal/:slug/me/packs/history',
    { preHandler: [requireCustomerAuth] },
    async (request, reply) => {
      const rows = await db
        .select({
          id: packTransactions.id,
          packId: packTransactions.packId,
          type: packTransactions.type,
          quantity: packTransactions.quantity,
          amount: packTransactions.amount,
          notes: packTransactions.notes,
          createdAt: packTransactions.createdAt,
          productSnapshot: packs.productSnapshot,
        })
        .from(packTransactions)
        .innerJoin(packs, eq(packTransactions.packId, packs.id))
        .where(
          and(eq(packs.customerId, request.customerId!), eq(packs.organizationId, request.orgId!)),
        )
        .orderBy(desc(packTransactions.createdAt));
      return reply.send(rows);
    },
  );
}
