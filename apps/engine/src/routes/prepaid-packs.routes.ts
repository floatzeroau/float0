import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/require-auth.js';
import { requireRole } from '../middleware/rbac.js';
import { listPacks, createPack, updatePack, deletePack } from './prepaid-packs.service.js';

const createSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).nullable().optional(),
  packSize: z.number().int().min(1),
  price: z.number().min(0),
  perItemValue: z.number().min(0),
  eligibleProductIds: z.array(z.string().uuid()).nullable().optional(),
  isActive: z.boolean().optional(),
  allowCustomSize: z.boolean().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  packSize: z.number().int().min(1).optional(),
  price: z.number().min(0).optional(),
  perItemValue: z.number().min(0).optional(),
  eligibleProductIds: z.array(z.string().uuid()).nullable().optional(),
  isActive: z.boolean().optional(),
  allowCustomSize: z.boolean().optional(),
});

const idParamSchema = z.object({
  id: z.string().uuid(),
});

export async function prepaidPackRoutes(app: FastifyInstance) {
  // GET /prepaid-packs
  app.get('/prepaid-packs', { preHandler: [requireAuth] }, async (request, reply) => {
    const packs = await listPacks(request.user.orgId);
    return reply.send(packs);
  });

  // POST /prepaid-packs
  app.post(
    '/prepaid-packs',
    { preHandler: [requireAuth, requireRole('admin')] },
    async (request, reply) => {
      const parsed = createSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          statusCode: 400,
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const pack = await createPack(request.user.orgId, parsed.data);
      return reply.status(201).send(pack);
    },
  );

  // PUT /prepaid-packs/:id
  app.put(
    '/prepaid-packs/:id',
    { preHandler: [requireAuth, requireRole('admin')] },
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

      const pack = await updatePack(request.user.orgId, params.data.id, parsed.data);
      return reply.send(pack);
    },
  );

  // DELETE /prepaid-packs/:id
  app.delete(
    '/prepaid-packs/:id',
    { preHandler: [requireAuth, requireRole('admin')] },
    async (request, reply) => {
      const params = idParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ error: 'Invalid ID', statusCode: 400 });
      }

      await deletePack(request.user.orgId, params.data.id);
      return reply.send({ message: 'Pack deactivated' });
    },
  );
}
