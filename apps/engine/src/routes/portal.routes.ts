import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { organizations } from '../db/schema/core.js';
import { resolveOrgBySlug } from './portal-auth.service.js';
import { listActivePacksForOrg } from './prepaid-packs.service.js';

// ---------------------------------------------------------------------------
// Public portal endpoint — NO auth required
// ---------------------------------------------------------------------------

export async function portalRoutes(app: FastifyInstance) {
  /**
   * GET /portal/:slug
   * Public endpoint that returns safe org info for the customer-facing portal.
   */
  app.get('/portal/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };

    const [org] = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        logo: organizations.logo,
        settings: organizations.settings,
      })
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1);

    if (!org) {
      return reply.status(404).send({ error: 'Organization not found', statusCode: 404 });
    }

    const settings = (org.settings ?? {}) as Record<string, unknown>;

    return reply.send({
      id: org.id,
      name: org.name,
      slug: org.slug,
      logo: org.logo,
      operatingHours: settings.operating_hours ?? null,
      socialMedia: settings.social_media ?? null,
    });
  });

  /**
   * GET /portal/:slug/packs
   * Public endpoint — list active prepaid packs for this org.
   */
  app.get('/portal/:slug/packs', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const org = await resolveOrgBySlug(slug);
    const packs = await listActivePacksForOrg(org.id);

    const result = packs.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      packSize: p.packSize,
      price: p.price,
      perItemValue: p.perItemValue,
      savings: p.perItemValue * p.packSize - p.price,
      allowCustomSize: p.allowCustomSize,
    }));

    return reply.send(result);
  });
}
