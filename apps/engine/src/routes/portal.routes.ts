import type { FastifyInstance } from 'fastify';
import { eq, and, isNull, asc } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { organizations } from '../db/schema/core.js';
import { categories, products } from '../db/schema/pos.js';
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

  /**
   * GET /portal/:slug/menu
   * Public endpoint — returns categories with their available products.
   */
  app.get('/portal/:slug/menu', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const org = await resolveOrgBySlug(slug);

    const cats = await db
      .select({
        id: categories.id,
        name: categories.name,
        colour: categories.colour,
        icon: categories.icon,
        sortOrder: categories.sortOrder,
      })
      .from(categories)
      .where(and(eq(categories.organizationId, org.id), isNull(categories.deletedAt)))
      .orderBy(asc(categories.sortOrder));

    const prods = await db
      .select({
        id: products.id,
        name: products.name,
        description: products.description,
        basePrice: products.basePrice,
        isAvailable: products.isAvailable,
        categoryId: products.categoryId,
        sortOrder: products.sortOrder,
      })
      .from(products)
      .where(
        and(
          eq(products.organizationId, org.id),
          eq(products.isAvailable, true),
          isNull(products.deletedAt),
        ),
      )
      .orderBy(asc(products.sortOrder));

    const productsByCategory = new Map<string, typeof prods>();
    for (const p of prods) {
      const list = productsByCategory.get(p.categoryId) ?? [];
      list.push(p);
      productsByCategory.set(p.categoryId, list);
    }

    const result = cats
      .map((c) => ({
        id: c.id,
        name: c.name,
        colour: c.colour,
        icon: c.icon,
        products: (productsByCategory.get(c.id) ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          basePrice: p.basePrice,
          isAvailable: p.isAvailable,
        })),
      }))
      .filter((c) => c.products.length > 0);

    return reply.send(result);
  });
}
