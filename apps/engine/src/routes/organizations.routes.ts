import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/require-auth.js';
import { requireRole } from '../middleware/rbac.js';
import {
  getOrganization,
  getOrganizationSettings,
  updateOrganization,
  mergeOrganizationSettings,
} from './organizations.service.js';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const abnSchema = z
  .string()
  .regex(/^\d{11}$/, 'ABN must be exactly 11 digits')
  .nullable()
  .optional();

const addressSchema = z
  .object({
    street: z.string().optional(),
    suburb: z.string().optional(),
    state: z.string().optional(),
    postcode: z.string().optional(),
  })
  .nullable()
  .optional();

const IANA_TZ_RE = /^[A-Za-z_]+\/[A-Za-z_/]+$/;

const updateOrgSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  abn: abnSchema,
  address: addressSchema,
  phone: z.string().max(50).nullable().optional(),
  email: z.string().email().nullable().optional(),
  website: z.string().max(255).nullable().optional(),
  logo: z.string().nullable().optional(),
  timezone: z
    .string()
    .regex(IANA_TZ_RE, 'Must be a valid IANA timezone (e.g. Australia/Melbourne)')
    .optional(),
  settings: z.record(z.unknown()).optional(),
});

const receiptSettingsSchema = z
  .object({
    headerText: z.string().optional(),
    footerText: z.string().optional(),
    socialMedia: z.string().optional(),
  })
  .optional();

const posSettingsSchema = z
  .object({
    defaultOrderType: z.string().optional(),
    tippingEnabled: z.boolean().optional(),
    tipPercentages: z.array(z.number()).optional(),
    cashRoundingEnabled: z.boolean().optional(),
    orderNumberPrefix: z.string().optional(),
  })
  .optional();

const dayHoursSchema = z.object({
  isOpen: z.boolean(),
  open: z.string(),
  close: z.string(),
});

const operatingHoursSchema = z.record(dayHoursSchema).optional();

const patchSettingsSchema = z.object({
  onboarding_status: z.string().optional(),
  receipt: receiptSettingsSchema,
  pos: posSettingsSchema,
  operating_hours: operatingHoursSchema,
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function organizationRoutes(app: FastifyInstance) {
  // GET /organizations/me
  app.get('/organizations/me', { preHandler: [requireAuth] }, async (request, reply) => {
    const org = await getOrganization(request.user.orgId);

    if (!org) {
      return reply.status(404).send({ error: 'Organization not found', statusCode: 404 });
    }

    return reply.send(org);
  });

  // PUT /organizations/me
  app.put(
    '/organizations/me',
    { preHandler: [requireAuth, requireRole('admin')] },
    async (request, reply) => {
      const parsed = updateOrgSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          statusCode: 400,
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const updated = await updateOrganization(request.user.orgId, parsed.data, {
        orgId: request.user.orgId,
        userId: request.user.userId,
        ip: request.ip,
      });

      return reply.send(updated);
    },
  );

  // GET /organizations/me/settings
  app.get('/organizations/me/settings', { preHandler: [requireAuth] }, async (request, reply) => {
    const settings = await getOrganizationSettings(request.user.orgId);

    if (settings === null) {
      return reply.status(404).send({ error: 'Organization not found', statusCode: 404 });
    }

    return reply.send(settings);
  });

  // PATCH /organizations/me/settings
  app.patch(
    '/organizations/me/settings',
    { preHandler: [requireAuth, requireRole('admin')] },
    async (request, reply) => {
      const parsed = patchSettingsSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          statusCode: 400,
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const merged = await mergeOrganizationSettings(request.user.orgId, parsed.data, {
        orgId: request.user.orgId,
        userId: request.user.userId,
        ip: request.ip,
      });

      return reply.send(merged);
    },
  );
}
