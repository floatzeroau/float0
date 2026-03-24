import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/require-auth.js';
import { requireRole } from '../middleware/rbac.js';
import { inviteUser, listTeamMembers } from './users.service.js';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const inviteSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  role: z.enum(['admin', 'manager', 'staff']),
  pin: z
    .string()
    .regex(/^\d{4,6}$/, 'PIN must be 4-6 digits')
    .optional(),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function userRoutes(app: FastifyInstance) {
  // LIST team members
  app.get('/users', { preHandler: [requireAuth] }, async (request, reply) => {
    const members = await listTeamMembers(request.user.orgId);
    return reply.send(members);
  });

  // INVITE user
  app.post(
    '/users/invite',
    { preHandler: [requireAuth, requireRole('manager')] },
    async (request, reply) => {
      const parsed = inviteSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          statusCode: 400,
          details: parsed.error.flatten().fieldErrors,
        });
      }

      try {
        const result = await inviteUser(request.user.orgId, parsed.data, {
          orgId: request.user.orgId,
          userId: request.user.userId,
          ip: request.ip,
        });
        return reply.status(201).send(result);
      } catch (err) {
        const error = err as Error & { statusCode?: number };
        const status = error.statusCode ?? 500;
        return reply.status(status).send({ error: error.message, statusCode: status });
      }
    },
  );
}
