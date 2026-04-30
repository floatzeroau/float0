import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, isNull, lt } from 'drizzle-orm';
import { requireCustomerAuth } from '../middleware/require-customer-auth.js';
import { getCustomerProfile, updateCustomerProfile } from './portal-auth.service.js';
import { db } from '../db/connection.js';
import { packs, packTransactions, orders } from '../db/schema/pos.js';

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
      // Auto-expire overdue packs before reading
      await db
        .update(packs)
        .set({ status: 'expired', updatedAt: new Date() })
        .where(
          and(
            eq(packs.organizationId, request.orgId!),
            eq(packs.customerId, request.customerId!),
            eq(packs.status, 'active'),
            lt(packs.expiryDate, new Date()),
          ),
        );

      const rows = await db
        .select({
          id: packs.id,
          productId: packs.productId,
          productSnapshot: packs.productSnapshot,
          totalQuantity: packs.totalQuantity,
          remainingQuantity: packs.remainingQuantity,
          pricePaid: packs.pricePaid,
          unitValue: packs.unitValue,
          status: packs.status,
          expiryDate: packs.expiryDate,
          sourceOrderId: packs.sourceOrderId,
          purchasedAt: packs.purchasedAt,
        })
        .from(packs)
        .where(
          and(
            eq(packs.customerId, request.customerId!),
            eq(packs.organizationId, request.orgId!),
            isNull(packs.deletedAt),
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

  // GET /portal/:slug/me/history
  // Unified timeline of orders + pack_transactions for the authenticated customer.
  app.get(
    '/portal/:slug/me/history',
    { preHandler: [requireCustomerAuth] },
    async (request, reply) => {
      const querySchema = z.object({
        cursor: z.string().datetime().optional(),
        limit: z.coerce.number().int().min(1).max(100).optional(),
      });
      const parsed = querySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Invalid query',
          statusCode: 400,
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const limit = parsed.data.limit ?? 30;
      const cursor = parsed.data.cursor ? new Date(parsed.data.cursor) : null;
      // Pull `limit + 1` to know if there's a next page.
      const fetchSize = limit + 1;

      // Fetch orders for this customer
      const orderConditions = [
        eq(orders.customerId, request.customerId!),
        eq(orders.organizationId, request.orgId!),
        isNull(orders.deletedAt),
      ];
      if (cursor) {
        orderConditions.push(lt(orders.createdAt, cursor));
      }

      const orderRows = await db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          status: orders.status,
          total: orders.total,
          createdAt: orders.createdAt,
        })
        .from(orders)
        .where(and(...orderConditions))
        .orderBy(desc(orders.createdAt))
        .limit(fetchSize);

      // Fetch pack transactions for this customer's packs
      const txConditions = [
        eq(packs.customerId, request.customerId!),
        eq(packs.organizationId, request.orgId!),
        isNull(packs.deletedAt),
      ];
      if (cursor) {
        txConditions.push(lt(packTransactions.createdAt, cursor));
      }

      const txRows = await db
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
        .where(and(...txConditions))
        .orderBy(desc(packTransactions.createdAt))
        .limit(fetchSize);

      type Entry = {
        id: string;
        type: 'order' | 'pack_purchase' | 'pack_serve' | 'pack_refund' | 'pack_adjust';
        description: string;
        amount: number | null;
        quantity: number | null;
        timestamp: string;
        referenceId: string | null;
        productSnapshot?: unknown;
      };

      const orderEntries: Entry[] = orderRows.map((o) => ({
        id: `order:${o.id}`,
        type: 'order',
        description: `Order #${o.orderNumber}`,
        amount: o.total,
        quantity: null,
        timestamp: o.createdAt.toISOString(),
        referenceId: o.id,
      }));

      const txEntries: Entry[] = txRows.map((tx) => {
        const snap = tx.productSnapshot as { name?: string } | null;
        const productName = snap?.name ?? 'pack';
        let type: Entry['type'];
        let description: string;
        switch (tx.type) {
          case 'purchase':
            type = 'pack_purchase';
            description = `Purchased ${tx.quantity} × ${productName}`;
            break;
          case 'serve':
            type = 'pack_serve';
            description = `Redeemed ${Math.abs(tx.quantity)} × ${productName}`;
            break;
          case 'refund':
            type = 'pack_refund';
            description = `Refunded ${Math.abs(tx.quantity)} × ${productName}`;
            break;
          case 'admin_adjust':
            type = 'pack_adjust';
            description = `Adjusted ${tx.quantity > 0 ? '+' : ''}${tx.quantity} × ${productName}${
              tx.notes ? ` — ${tx.notes}` : ''
            }`;
            break;
          default:
            type = 'pack_serve';
            description = `${tx.type} ${tx.quantity}`;
        }
        return {
          id: `tx:${tx.id}`,
          type,
          description,
          amount: tx.amount ?? null,
          quantity: tx.quantity,
          timestamp: tx.createdAt.toISOString(),
          referenceId: tx.packId,
          productSnapshot: tx.productSnapshot,
        };
      });

      const merged = [...orderEntries, ...txEntries].sort((a, b) =>
        a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0,
      );

      const hasMore = merged.length > limit;
      const data = merged.slice(0, limit);
      const nextCursor = hasMore ? data[data.length - 1].timestamp : null;

      return reply.send({ data, nextCursor, limit });
    },
  );
}
