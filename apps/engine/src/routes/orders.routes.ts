import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/require-auth.js';
import { listOrders, getOrder, voidOrder } from './orders.service.js';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  status: z.enum(['draft', 'open', 'completed', 'voided', 'refunded']).optional(),
  orderType: z.enum(['dine_in', 'takeaway', 'delivery']).optional(),
  search: z.string().optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
    .optional(),
});

const idParamSchema = z.object({
  id: z.string().uuid(),
});

const voidBodySchema = z.object({
  reason: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function orderRoutes(app: FastifyInstance) {
  // LIST (paginated)
  app.get('/orders', { preHandler: [requireAuth] }, async (request, reply) => {
    const query = listQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        statusCode: 400,
        details: query.error.flatten().fieldErrors,
      });
    }

    const result = await listOrders({
      orgId: request.user.orgId,
      ...query.data,
    });

    return reply.send(result);
  });

  // GET ONE (with items + payments)
  app.get('/orders/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        statusCode: 400,
        details: params.error.flatten().fieldErrors,
      });
    }

    const order = await getOrder(request.user.orgId, params.data.id);
    if (!order) {
      return reply.status(404).send({ error: 'Order not found', statusCode: 404 });
    }

    return reply.send(order);
  });

  // VOID ORDER
  app.post('/orders/:id/void', { preHandler: [requireAuth] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        statusCode: 400,
        details: params.error.flatten().fieldErrors,
      });
    }

    // Only owner/admin can void orders
    const role = request.user.role;
    if (role !== 'owner' && role !== 'admin') {
      return reply
        .status(403)
        .send({ error: 'Only owners and admins can void orders', statusCode: 403 });
    }

    const body = voidBodySchema.safeParse(request.body ?? {});
    const reason = body.success ? body.data.reason : undefined;

    const result = await voidOrder(request.user.orgId, params.data.id, reason);
    if (!result.success) {
      return reply.status(400).send({ error: result.error, statusCode: 400 });
    }

    return reply.send({ success: true });
  });
}
