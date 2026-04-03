import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/require-auth.js';
import { requireRole } from '../middleware/rbac.js';
import {
  inviteUser,
  listOrgUsers,
  updateOrgMember,
  deactivateUser,
  setupAccount,
} from './users.service.js';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[a-zA-Z]/, 'Password must contain at least one letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

const inviteSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(['admin', 'manager', 'staff']),
  posPin: z
    .string()
    .regex(/^\d{4,6}$/, 'PIN must be 4-6 digits')
    .optional(),
});

const setupAccountSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});

const listQuerySchema = z.object({
  role: z.enum(['owner', 'admin', 'manager', 'staff']).optional(),
  search: z.string().optional(),
});

const updateMemberSchema = z.object({
  role: z.enum(['admin', 'manager', 'staff']).optional(),
  pin: z
    .string()
    .regex(/^\d{4,6}$/, 'PIN must be 4-6 digits')
    .optional(),
});

const idParamSchema = z.object({
  id: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function userRoutes(app: FastifyInstance) {
  // POST /users/invite
  app.post(
    '/users/invite',
    { preHandler: [requireAuth, requireRole('admin')] },
    async (request, reply) => {
      const parsed = inviteSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          statusCode: 400,
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const result = await inviteUser(app, request.user.orgId, parsed.data, {
        orgId: request.user.orgId,
        userId: request.user.userId,
        ip: request.ip,
      });

      return reply.status(201).send(result);
    },
  );

  // POST /auth/setup-account (no auth required — token-based)
  app.post('/auth/setup-account', async (request, reply) => {
    const parsed = setupAccountSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        statusCode: 400,
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const result = await setupAccount(app, parsed.data.token, parsed.data.password, request.ip);

    return reply.send(result);
  });

  // GET /users
  app.get('/users', { preHandler: [requireAuth] }, async (request, reply) => {
    const query = listQuerySchema.safeParse(request.query);
    const options = query.success ? query.data : {};

    const rows = await listOrgUsers(request.user.orgId, options);
    return reply.send(rows);
  });

  // PUT /users/:id (update role / PIN)
  app.put(
    '/users/:id',
    { preHandler: [requireAuth, requireRole('admin')] },
    async (request, reply) => {
      const params = idParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          statusCode: 400,
          details: params.error.flatten().fieldErrors,
        });
      }

      const parsed = updateMemberSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          statusCode: 400,
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const result = await updateOrgMember(request.user.orgId, params.data.id, parsed.data, {
        orgId: request.user.orgId,
        userId: request.user.userId,
        ip: request.ip,
      });

      return reply.send(result);
    },
  );

  // DELETE /users/:id (soft-deactivate)
  app.delete(
    '/users/:id',
    { preHandler: [requireAuth, requireRole('admin')] },
    async (request, reply) => {
      const params = idParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          statusCode: 400,
          details: params.error.flatten().fieldErrors,
        });
      }

      const result = await deactivateUser(request.user.orgId, params.data.id, {
        orgId: request.user.orgId,
        userId: request.user.userId,
        ip: request.ip,
      });

      return reply.send(result);
    },
  );
}
