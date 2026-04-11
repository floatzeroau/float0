import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  resolveOrgBySlug,
  registerCustomer,
  loginCustomer,
  setupCustomerPassword,
  refreshCustomerToken,
} from './portal-auth.service.js';

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[a-zA-Z]/, 'Password must contain at least one letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

const registerSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const setupSchema = z.object({
  setupToken: z.string().min(1),
  password: passwordSchema,
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export async function portalAuthRoutes(app: FastifyInstance) {
  // POST /portal/:slug/auth/register
  app.post('/portal/:slug/auth/register', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        statusCode: 400,
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const org = await resolveOrgBySlug(slug);
    const result = await registerCustomer(app, org.id, parsed.data);
    return reply.status(201).send(result);
  });

  // POST /portal/:slug/auth/login
  app.post('/portal/:slug/auth/login', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        statusCode: 400,
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const org = await resolveOrgBySlug(slug);

    try {
      const result = await loginCustomer(app, org.id, parsed.data.email, parsed.data.password);
      return reply.send(result);
    } catch (err) {
      const error = err as Error & {
        statusCode?: number;
        code?: string;
        setupToken?: string;
        customerId?: string;
      };

      if (error.code === 'SETUP_REQUIRED') {
        return reply.status(400).send({
          error: error.message,
          statusCode: 400,
          code: 'SETUP_REQUIRED',
          setupToken: error.setupToken,
          customerId: error.customerId,
        });
      }

      throw err;
    }
  });

  // POST /portal/:slug/auth/setup
  app.post('/portal/:slug/auth/setup', async (request, reply) => {
    const parsed = setupSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        statusCode: 400,
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const result = await setupCustomerPassword(app, parsed.data.setupToken, parsed.data.password);
    return reply.send(result);
  });

  // POST /portal/:slug/auth/refresh
  app.post('/portal/:slug/auth/refresh', async (request, reply) => {
    const parsed = refreshSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        statusCode: 400,
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const result = await refreshCustomerToken(app, parsed.data.refreshToken);
    return reply.send(result);
  });
}
