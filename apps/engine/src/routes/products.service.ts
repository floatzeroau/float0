import { eq, and, isNull, asc, desc, sql, ilike } from 'drizzle-orm';
import { db } from '../db/connection.js';
import {
  products,
  categories,
  productModifierGroups,
  modifierGroups,
  modifiers,
  orderItems,
} from '../db/schema/pos.js';
import { auditLog } from '../db/schema/core.js';
import { eventBus } from '@float0/events';
import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateProductInput {
  name: string;
  description?: string | null;
  categoryId: string;
  basePrice: number;
  sku?: string | null;
  barcode?: string | null;
  imageUrl?: string | null;
  isAvailable?: boolean;
  sortOrder?: number;
}

interface UpdateProductInput {
  name?: string;
  description?: string | null;
  categoryId?: string;
  basePrice?: number;
  sku?: string | null;
  barcode?: string | null;
  imageUrl?: string | null;
  isAvailable?: boolean;
  sortOrder?: number;
}

interface ListProductsOptions {
  categoryId?: string;
  isAvailable?: boolean;
  search?: string;
  sortBy?: 'name' | 'basePrice' | 'sortOrder' | 'createdAt';
  sortDir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

interface AuditContext {
  orgId: string;
  userId: string;
  ip?: string;
}

function generateShortSku(): string {
  return crypto.randomUUID().slice(0, 8).toUpperCase();
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listProducts(orgId: string, options: ListProductsOptions = {}) {
  const {
    categoryId,
    isAvailable,
    search,
    sortBy = 'sortOrder',
    sortDir = 'asc',
    limit = 50,
    offset = 0,
  } = options;

  const conditions = [eq(products.organizationId, orgId), isNull(products.deletedAt)];

  if (categoryId) {
    conditions.push(eq(products.categoryId, categoryId));
  }
  if (isAvailable !== undefined) {
    conditions.push(eq(products.isAvailable, isAvailable));
  }
  if (search) {
    conditions.push(ilike(products.name, `%${search}%`));
  }

  const sortColumn = {
    name: products.name,
    basePrice: products.basePrice,
    sortOrder: products.sortOrder,
    createdAt: products.createdAt,
  }[sortBy];

  const orderFn = sortDir === 'desc' ? desc : asc;

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      description: products.description,
      categoryId: products.categoryId,
      categoryName: categories.name,
      basePrice: products.basePrice,
      sku: products.sku,
      barcode: products.barcode,
      imageUrl: products.imageUrl,
      isAvailable: products.isAvailable,
      sortOrder: products.sortOrder,
      _version: products._version,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
      modifierGroupCount: sql<number>`(select cast(count(*) as int) from product_modifier_groups where product_id = ${products.id} and deleted_at is null)`,
    })
    .from(products)
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(and(...conditions))
    .orderBy(orderFn(sortColumn))
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db
    .select({ total: sql<number>`cast(count(*) as int)` })
    .from(products)
    .where(and(...conditions));

  return { data: rows, total, limit, offset };
}

export async function getProduct(orgId: string, id: string) {
  const [product] = await db
    .select({
      id: products.id,
      name: products.name,
      description: products.description,
      categoryId: products.categoryId,
      categoryName: categories.name,
      basePrice: products.basePrice,
      sku: products.sku,
      barcode: products.barcode,
      imageUrl: products.imageUrl,
      isAvailable: products.isAvailable,
      sortOrder: products.sortOrder,
      _version: products._version,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(
      and(eq(products.id, id), eq(products.organizationId, orgId), isNull(products.deletedAt)),
    );

  if (!product) return null;

  // Fetch modifier groups with their modifiers
  const groups = await db
    .select({
      linkId: productModifierGroups.id,
      linkSortOrder: productModifierGroups.sortOrder,
      id: modifierGroups.id,
      name: modifierGroups.name,
      displayName: modifierGroups.displayName,
      selectionType: modifierGroups.selectionType,
      minSelections: modifierGroups.minSelections,
      maxSelections: modifierGroups.maxSelections,
      sortOrder: modifierGroups.sortOrder,
    })
    .from(productModifierGroups)
    .innerJoin(modifierGroups, eq(modifierGroups.id, productModifierGroups.modifierGroupId))
    .where(
      and(
        eq(productModifierGroups.productId, id),
        isNull(productModifierGroups.deletedAt),
        isNull(modifierGroups.deletedAt),
      ),
    )
    .orderBy(asc(productModifierGroups.sortOrder));

  const groupsWithModifiers = await Promise.all(
    groups.map(async (g) => {
      const mods = await db
        .select({
          id: modifiers.id,
          name: modifiers.name,
          priceAdjustment: modifiers.priceAdjustment,
          isDefault: modifiers.isDefault,
          isAvailable: modifiers.isAvailable,
          sortOrder: modifiers.sortOrder,
        })
        .from(modifiers)
        .where(and(eq(modifiers.modifierGroupId, g.id), isNull(modifiers.deletedAt)))
        .orderBy(asc(modifiers.sortOrder));

      return {
        id: g.id,
        name: g.name,
        displayName: g.displayName,
        selectionType: g.selectionType,
        minSelections: g.minSelections,
        maxSelections: g.maxSelections,
        sortOrder: g.linkSortOrder,
        modifiers: mods,
      };
    }),
  );

  return { ...product, modifierGroups: groupsWithModifiers };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function createProduct(orgId: string, input: CreateProductInput, ctx: AuditContext) {
  // Verify category exists in org
  const [cat] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.id, input.categoryId),
        eq(categories.organizationId, orgId),
        isNull(categories.deletedAt),
      ),
    );

  if (!cat) {
    throw Object.assign(new Error('Category not found'), { statusCode: 404 });
  }

  const sku = input.sku ?? generateShortSku();

  // Check SKU uniqueness within org
  const [skuConflict] = await db
    .select({ id: products.id })
    .from(products)
    .where(
      and(eq(products.organizationId, orgId), eq(products.sku, sku), isNull(products.deletedAt)),
    );

  if (skuConflict) {
    throw Object.assign(new Error('SKU already exists in this organization'), { statusCode: 409 });
  }

  const [created] = await db
    .insert(products)
    .values({
      organizationId: orgId,
      name: input.name,
      description: input.description,
      categoryId: input.categoryId,
      basePrice: input.basePrice,
      sku,
      barcode: input.barcode,
      imageUrl: input.imageUrl,
      isAvailable: input.isAvailable ?? true,
      sortOrder: input.sortOrder ?? 0,
    })
    .returning();

  await db
    .insert(auditLog)
    .values({
      organizationId: ctx.orgId,
      userId: ctx.userId,
      action: 'product.create',
      entityType: 'product',
      entityId: created.id,
      changes: { created: input },
      ipAddress: ctx.ip,
    })
    .catch(() => {});

  return created;
}

export async function updateProduct(
  orgId: string,
  id: string,
  input: UpdateProductInput,
  ctx: AuditContext,
) {
  const [existing] = await db
    .select()
    .from(products)
    .where(
      and(eq(products.id, id), eq(products.organizationId, orgId), isNull(products.deletedAt)),
    );

  if (!existing) {
    throw Object.assign(new Error('Product not found'), { statusCode: 404 });
  }

  // If changing category, verify it exists
  if (input.categoryId) {
    const [cat] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.id, input.categoryId),
          eq(categories.organizationId, orgId),
          isNull(categories.deletedAt),
        ),
      );

    if (!cat) {
      throw Object.assign(new Error('Category not found'), { statusCode: 404 });
    }
  }

  // If changing SKU, check uniqueness
  if (input.sku !== undefined && input.sku !== null && input.sku !== existing.sku) {
    const [skuConflict] = await db
      .select({ id: products.id })
      .from(products)
      .where(
        and(
          eq(products.organizationId, orgId),
          eq(products.sku, input.sku),
          isNull(products.deletedAt),
        ),
      );

    if (skuConflict) {
      throw Object.assign(new Error('SKU already exists in this organization'), {
        statusCode: 409,
      });
    }
  }

  const [updated] = await db
    .update(products)
    .set({
      ...input,
      updatedAt: new Date(),
      _version: existing._version + 1,
    })
    .where(and(eq(products.id, id), eq(products.organizationId, orgId)))
    .returning();

  await db
    .insert(auditLog)
    .values({
      organizationId: ctx.orgId,
      userId: ctx.userId,
      action: 'product.update',
      entityType: 'product',
      entityId: id,
      changes: { before: existing, after: updated },
      ipAddress: ctx.ip,
    })
    .catch(() => {});

  return updated;
}

export async function deleteProduct(orgId: string, id: string, ctx: AuditContext) {
  const [existing] = await db
    .select()
    .from(products)
    .where(
      and(eq(products.id, id), eq(products.organizationId, orgId), isNull(products.deletedAt)),
    );

  if (!existing) {
    throw Object.assign(new Error('Product not found'), { statusCode: 404 });
  }

  // Check for order_items referencing this product
  const [{ count }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(orderItems)
    .where(eq(orderItems.productId, id));

  if (count > 0) {
    throw Object.assign(new Error(`Cannot delete product referenced by ${count} order item(s)`), {
      statusCode: 409,
    });
  }

  const [deleted] = await db
    .update(products)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
      _version: existing._version + 1,
    })
    .where(and(eq(products.id, id), eq(products.organizationId, orgId)))
    .returning();

  await db
    .insert(auditLog)
    .values({
      organizationId: ctx.orgId,
      userId: ctx.userId,
      action: 'product.delete',
      entityType: 'product',
      entityId: id,
      changes: { deleted: existing },
      ipAddress: ctx.ip,
    })
    .catch(() => {});

  return deleted;
}

export async function duplicateProduct(orgId: string, id: string, ctx: AuditContext) {
  const [source] = await db
    .select()
    .from(products)
    .where(
      and(eq(products.id, id), eq(products.organizationId, orgId), isNull(products.deletedAt)),
    );

  if (!source) {
    throw Object.assign(new Error('Product not found'), { statusCode: 404 });
  }

  const [created] = await db
    .insert(products)
    .values({
      organizationId: orgId,
      name: `${source.name} (Copy)`,
      description: source.description,
      categoryId: source.categoryId,
      basePrice: source.basePrice,
      sku: generateShortSku(),
      barcode: null,
      imageUrl: source.imageUrl,
      isAvailable: source.isAvailable,
      sortOrder: source.sortOrder,
    })
    .returning();

  // Clone modifier group assignments
  const links = await db
    .select()
    .from(productModifierGroups)
    .where(and(eq(productModifierGroups.productId, id), isNull(productModifierGroups.deletedAt)));

  if (links.length > 0) {
    await db.insert(productModifierGroups).values(
      links.map((link) => ({
        organizationId: orgId,
        productId: created.id,
        modifierGroupId: link.modifierGroupId,
        sortOrder: link.sortOrder,
      })),
    );
  }

  await db
    .insert(auditLog)
    .values({
      organizationId: ctx.orgId,
      userId: ctx.userId,
      action: 'product.duplicate',
      entityType: 'product',
      entityId: created.id,
      changes: { sourceId: id, created: created },
      ipAddress: ctx.ip,
    })
    .catch(() => {});

  return created;
}

export async function toggleAvailability(orgId: string, id: string, ctx: AuditContext) {
  const [existing] = await db
    .select()
    .from(products)
    .where(
      and(eq(products.id, id), eq(products.organizationId, orgId), isNull(products.deletedAt)),
    );

  if (!existing) {
    throw Object.assign(new Error('Product not found'), { statusCode: 404 });
  }

  const newAvailability = !existing.isAvailable;

  const [updated] = await db
    .update(products)
    .set({
      isAvailable: newAvailability,
      updatedAt: new Date(),
      _version: existing._version + 1,
    })
    .where(and(eq(products.id, id), eq(products.organizationId, orgId)))
    .returning();

  eventBus.emit('products.availability_changed', {
    productId: id,
    isAvailable: newAvailability,
    organizationId: orgId,
  });

  await db
    .insert(auditLog)
    .values({
      organizationId: ctx.orgId,
      userId: ctx.userId,
      action: 'product.availability_changed',
      entityType: 'product',
      entityId: id,
      changes: { before: existing.isAvailable, after: newAvailability },
      ipAddress: ctx.ip,
    })
    .catch(() => {});

  return updated;
}
