import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  loginUser,
  registerUser,
  refreshAccessToken,
  logoutUser,
  pinLogin,
  setPin,
} from './auth.service.js';
import { requireAuth } from '../middleware/require-auth.js';
import { requireRole } from '../middleware/rbac.js';

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[a-zA-Z]/, 'Password must contain at least one letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
  firstName: z.string().min(1),
  lastName: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const logoutSchema = z.object({
  refreshToken: z.string().optional(),
});

const pinLoginSchema = z.object({
  orgId: z.string().uuid(),
  pin: z.string().regex(/^\d{4,6}$/, 'PIN must be 4-6 digits'),
});

const pinSetSchema = z.object({
  userId: z.string().uuid(),
  pin: z.string().regex(/^\d{4,6}$/, 'PIN must be 4-6 digits'),
});

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        statusCode: 400,
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { email, password } = parsed.data;
    const tokens = await loginUser(app, email, password, request.ip);

    return reply.send(tokens);
  });

  app.post('/auth/register', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        statusCode: 400,
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const tokens = await registerUser(app, parsed.data, request.ip);

    return reply.status(201).send(tokens);
  });

  app.post('/auth/refresh', async (request, reply) => {
    const parsed = refreshSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        statusCode: 400,
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const tokens = await refreshAccessToken(app, parsed.data.refreshToken);

    return reply.send(tokens);
  });

  app.post('/auth/logout', { preHandler: [requireAuth] }, async (request, reply) => {
    const parsed = logoutSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        statusCode: 400,
        details: parsed.error.flatten().fieldErrors,
      });
    }

    await logoutUser(request.user.userId, parsed.data.refreshToken);

    return reply.send({ message: 'Logged out' });
  });

  app.post('/auth/pin', async (request, reply) => {
    const parsed = pinLoginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        statusCode: 400,
        details: parsed.error.flatten().fieldErrors,
      });
    }

    try {
      const result = await pinLogin(app, parsed.data.orgId, parsed.data.pin, request.ip);
      return reply.send(result);
    } catch (err) {
      const error = err as Error & { statusCode?: number; retryAfter?: number };
      const status = error.statusCode ?? 500;
      const body: Record<string, unknown> = { error: error.message, statusCode: status };
      if (error.retryAfter) {
        body.retryAfter = error.retryAfter;
      }
      return reply.status(status).send(body);
    }
  });

  app.post(
    '/auth/pin/set',
    { preHandler: [requireAuth, requireRole('manager')] },
    async (request, reply) => {
      const parsed = pinSetSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          statusCode: 400,
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const { userId: targetUserId, pin } = parsed.data;
      await setPin(request.user.orgId, targetUserId, pin);

      return reply.send({ message: 'PIN set successfully' });
    },
  );
}
