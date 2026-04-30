import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/require-auth.js';
import { requireRole } from '../middleware/rbac.js';
import {
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deactivateCustomer,
  getPackCustomerCounts,
  enablePortalAccess,
} from './customers.service.js';

const idParamSchema = z.object({
  id: z.string().uuid(),
});

const createSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().max(255).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
});

const updateSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  email: z.string().email().max(255).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
});

const listQuerySchema = z.object({
  search: z.string().optional(),
  sort: z.enum(['name', 'totalSpent', 'visitCount', 'lastVisit']).optional(),
  dir: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export async function customerRoutes(app: FastifyInstance) {
  // GET /customers
  app.get('/customers', { preHandler: [requireAuth] }, async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid query parameters',
        statusCode: 400,
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const result = await listCustomers(request.user.orgId, parsed.data);
    return reply.send(result);
  });

  // GET /customers/pack-counts
  app.get('/customers/pack-counts', { preHandler: [requireAuth] }, async (request, reply) => {
    const counts = await getPackCustomerCounts(request.user.orgId);
    return reply.send(counts);
  });

  // GET /customers/:id
  app.get('/customers/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'Invalid customer ID', statusCode: 400 });
    }

    const customer = await getCustomer(request.user.orgId, params.data.id);
    return reply.send(customer);
  });

  // POST /customers
  app.post(
    '/customers',
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

      const customer = await createCustomer(request.user.orgId, parsed.data);
      return reply.status(201).send(customer);
    },
  );

  // PUT /customers/:id
  app.put(
    '/customers/:id',
    { preHandler: [requireAuth, requireRole('manager')] },
    async (request, reply) => {
      const params = idParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ error: 'Invalid ID', statusCode: 400 });
      }

      const parsed = updateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          statusCode: 400,
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const customer = await updateCustomer(request.user.orgId, params.data.id, parsed.data);
      return reply.send(customer);
    },
  );

  // DELETE /customers/:id
  app.delete(
    '/customers/:id',
    { preHandler: [requireAuth, requireRole('manager')] },
    async (request, reply) => {
      const params = idParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ error: 'Invalid ID', statusCode: 400 });
      }

      await deactivateCustomer(request.user.orgId, params.data.id);
      return reply.send({ message: 'Customer deactivated' });
    },
  );

  // POST /customers/:id/enable-portal
  app.post(
    '/customers/:id/enable-portal',
    { preHandler: [requireAuth, requireRole('manager')] },
    async (request, reply) => {
      const params = idParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ error: 'Invalid customer ID', statusCode: 400 });
      }

      const bodySchema = z.object({
        email: z.string().email().optional(),
      });

      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          statusCode: 400,
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const result = await enablePortalAccess(
        request.user.orgId,
        params.data.id,
        parsed.data.email,
      );

      // Generate 72-hour setup JWT (different payload shape — cast needed)
      const setupToken = request.server.jwt.sign(
        {
          purpose: 'customer-setup',
          customerId: result.customerId,
          orgId: request.user.orgId,
          role: 'customer',
        } as unknown as Parameters<typeof request.server.jwt.sign>[0],
        { expiresIn: '72h' },
      );

      const portalBaseUrl = process.env.PORTAL_BASE_URL ?? 'http://localhost:3001';
      const setupUrl = `${portalBaseUrl}/${result.orgSlug}/setup?token=${setupToken}`;

      return reply.send({
        setupUrl,
        setupToken,
        email: result.email,
      });
    },
  );
}
