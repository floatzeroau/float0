import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/require-auth.js';
import { listTerminals } from './terminals.service.js';

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function terminalRoutes(app: FastifyInstance) {
  app.get('/terminals', { preHandler: [requireAuth] }, async (request, reply) => {
    const terminals = await listTerminals(request.user.orgId);
    return reply.send(terminals);
  });
}
