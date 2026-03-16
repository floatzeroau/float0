import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/require-auth.js';
import { pullAllChanges, pushAllChanges } from './sync.helpers.js';

const pullSchema = z.object({
  lastPulledAt: z.number().nullable(),
  schemaVersion: z.number().int().positive(),
});

const syncTableChangesSchema = z.object({
  created: z.array(z.record(z.unknown())).default([]),
  updated: z.array(z.record(z.unknown())).default([]),
  deleted: z.array(z.string()).default([]),
});

const pushSchema = z.object({
  lastPulledAt: z.number(),
  changes: z.record(syncTableChangesSchema).default({}),
});

export async function syncRoutes(app: FastifyInstance) {
  app.post('/sync/pull', { preHandler: [requireAuth] }, async (request, reply) => {
    const parsed = pullSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        statusCode: 400,
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { lastPulledAt } = parsed.data;
    const result = await pullAllChanges(request.user.orgId, lastPulledAt);
    return reply.send(result);
  });

  app.post('/sync/push', { preHandler: [requireAuth] }, async (request, reply) => {
    const parsed = pushSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        statusCode: 400,
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { changes, lastPulledAt } = parsed.data;
    await pushAllChanges(request.user.orgId, changes, lastPulledAt);
    return reply.send({ ok: true });
  });
}
