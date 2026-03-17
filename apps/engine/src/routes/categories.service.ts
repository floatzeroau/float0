import { eq, and, isNull, asc, sql } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { categories, products } from '../db/schema/pos.js';
import { auditLog } from '../db/schema/core.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateCategoryInput {
  name: string;
  colour?: string | null;
  icon?: string | null;
  sortOrder?: number;
  parentId?: string | null;
}

interface UpdateCategoryInput {
  name?: string;
  colour?: string | null;
  icon?: string | null;
  sortOrder?: number;
  parentId?: string | null;
}

interface ReorderItem {
  id: string;
  sortOrder: number;
}

interface AuditContext {
  orgId: string;
  userId: string;
  ip?: string;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listCategories(orgId: string, parentId?: string) {
  const conditions = [eq(categories.organizationId, orgId), isNull(categories.deletedAt)];

  if (parentId !== undefined) {
    conditions.push(
      parentId === null ? isNull(categories.parentId) : eq(categories.parentId, parentId),
    );
  }

  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      colour: categories.colour,
      icon: categories.icon,
      sortOrder: categories.sortOrder,
      parentId: categories.parentId,
      _version: categories._version,
      createdAt: categories.createdAt,
      updatedAt: categories.updatedAt,
      productCount: sql<number>`cast(count(${products.id}) as int)`,
    })
    .from(categories)
    .leftJoin(products, and(eq(products.categoryId, categories.id), isNull(products.deletedAt)))
    .where(and(...conditions))
    .groupBy(categories.id)
    .orderBy(asc(categories.sortOrder));

  return rows;
}

export async function getCategory(orgId: string, id: string) {
  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      colour: categories.colour,
      icon: categories.icon,
      sortOrder: categories.sortOrder,
      parentId: categories.parentId,
      _version: categories._version,
      createdAt: categories.createdAt,
      updatedAt: categories.updatedAt,
      productCount: sql<number>`cast(count(${products.id}) as int)`,
    })
    .from(categories)
    .leftJoin(products, and(eq(products.categoryId, categories.id), isNull(products.deletedAt)))
    .where(
      and(
        eq(categories.id, id),
        eq(categories.organizationId, orgId),
        isNull(categories.deletedAt),
      ),
    )
    .groupBy(categories.id);

  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function createCategory(orgId: string, input: CreateCategoryInput, ctx: AuditContext) {
  const [created] = await db
    .insert(categories)
    .values({
      organizationId: orgId,
      name: input.name,
      colour: input.colour,
      icon: input.icon,
      sortOrder: input.sortOrder ?? 0,
      parentId: input.parentId,
    })
    .returning();

  await db
    .insert(auditLog)
    .values({
      organizationId: ctx.orgId,
      userId: ctx.userId,
      action: 'category.create',
      entityType: 'category',
      entityId: created.id,
      changes: { created: input },
      ipAddress: ctx.ip,
    })
    .catch(() => {});

  return created;
}

export async function updateCategory(
  orgId: string,
  id: string,
  input: UpdateCategoryInput,
  ctx: AuditContext,
) {
  // Fetch current to check existence and get version
  const [existing] = await db
    .select()
    .from(categories)
    .where(
      and(
        eq(categories.id, id),
        eq(categories.organizationId, orgId),
        isNull(categories.deletedAt),
      ),
    );

  if (!existing) {
    throw Object.assign(new Error('Category not found'), { statusCode: 404 });
  }

  const [updated] = await db
    .update(categories)
    .set({
      ...input,
      updatedAt: new Date(),
      _version: existing._version + 1,
    })
    .where(and(eq(categories.id, id), eq(categories.organizationId, orgId)))
    .returning();

  await db
    .insert(auditLog)
    .values({
      organizationId: ctx.orgId,
      userId: ctx.userId,
      action: 'category.update',
      entityType: 'category',
      entityId: id,
      changes: { before: existing, after: updated },
      ipAddress: ctx.ip,
    })
    .catch(() => {});

  return updated;
}

export async function deleteCategory(orgId: string, id: string, ctx: AuditContext) {
  const [existing] = await db
    .select()
    .from(categories)
    .where(
      and(
        eq(categories.id, id),
        eq(categories.organizationId, orgId),
        isNull(categories.deletedAt),
      ),
    );

  if (!existing) {
    throw Object.assign(new Error('Category not found'), { statusCode: 404 });
  }

  // Check for active products
  const [{ count }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(products)
    .where(and(eq(products.categoryId, id), isNull(products.deletedAt)));

  if (count > 0) {
    throw Object.assign(new Error(`Cannot delete category with ${count} active product(s)`), {
      statusCode: 409,
    });
  }

  const [deleted] = await db
    .update(categories)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
      _version: existing._version + 1,
    })
    .where(and(eq(categories.id, id), eq(categories.organizationId, orgId)))
    .returning();

  await db
    .insert(auditLog)
    .values({
      organizationId: ctx.orgId,
      userId: ctx.userId,
      action: 'category.delete',
      entityType: 'category',
      entityId: id,
      changes: { deleted: existing },
      ipAddress: ctx.ip,
    })
    .catch(() => {});

  return deleted;
}

export async function reorderCategories(orgId: string, items: ReorderItem[], ctx: AuditContext) {
  await db.transaction(async (tx) => {
    for (const item of items) {
      await tx
        .update(categories)
        .set({
          sortOrder: item.sortOrder,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(categories.id, item.id),
            eq(categories.organizationId, orgId),
            isNull(categories.deletedAt),
          ),
        );
    }
  });

  await db
    .insert(auditLog)
    .values({
      organizationId: ctx.orgId,
      userId: ctx.userId,
      action: 'category.reorder',
      entityType: 'category',
      changes: { items },
      ipAddress: ctx.ip,
    })
    .catch(() => {});

  return { ok: true };
}
