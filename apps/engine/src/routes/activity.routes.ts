import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/require-auth.js';
import { listActivity } from './activity.service.js';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function activityRoutes(app: FastifyInstance) {
  app.get('/activity', { preHandler: [requireAuth] }, async (request, reply) => {
    const query = querySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        statusCode: 400,
        details: query.error.flatten().fieldErrors,
      });
    }

    const entries = await listActivity(request.user.orgId, query.data.limit);
    return reply.send(entries);
  });
}
