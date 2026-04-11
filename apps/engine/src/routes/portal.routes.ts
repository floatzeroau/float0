import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { organizations } from '../db/schema/core.js';

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
}
