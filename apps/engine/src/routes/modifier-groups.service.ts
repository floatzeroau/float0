import { eq, and, isNull, asc, sql } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { modifierGroups, modifiers, productModifierGroups, products } from '../db/schema/pos.js';
import { auditLog } from '../db/schema/core.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateModifierGroupInput {
  name: string;
  displayName?: string | null;
  selectionType?: 'single' | 'multiple';
  minSelections?: number;
  maxSelections?: number;
  sortOrder?: number;
}

interface UpdateModifierGroupInput {
  name?: string;
  displayName?: string | null;
  selectionType?: 'single' | 'multiple';
  minSelections?: number;
  maxSelections?: number;
  sortOrder?: number;
}

interface LinkInput {
  modifierGroupId: string;
  sortOrder?: number;
}

interface AuditContext {
  orgId: string;
  userId: string;
  ip?: string;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listModifierGroups(orgId: string) {
  const rows = await db
    .select({
      id: modifierGroups.id,
      name: modifierGroups.name,
      displayName: modifierGroups.displayName,
      selectionType: modifierGroups.selectionType,
      minSelections: modifierGroups.minSelections,
      maxSelections: modifierGroups.maxSelections,
      sortOrder: modifierGroups.sortOrder,
      _version: modifierGroups._version,
      createdAt: modifierGroups.createdAt,
      updatedAt: modifierGroups.updatedAt,
      modifierCount: sql<number>`(select cast(count(*) as int) from modifiers where modifier_group_id = ${modifierGroups.id} and deleted_at is null)`,
      productCount: sql<number>`(select cast(count(*) as int) from product_modifier_groups where modifier_group_id = ${modifierGroups.id} and deleted_at is null)`,
    })
    .from(modifierGroups)
    .where(and(eq(modifierGroups.organizationId, orgId), isNull(modifierGroups.deletedAt)))
    .orderBy(asc(modifierGroups.sortOrder));

  return rows;
}

export async function getModifierGroup(orgId: string, id: string) {
  const [group] = await db
    .select({
      id: modifierGroups.id,
      name: modifierGroups.name,
      displayName: modifierGroups.displayName,
      selectionType: modifierGroups.selectionType,
      minSelections: modifierGroups.minSelections,
      maxSelections: modifierGroups.maxSelections,
      sortOrder: modifierGroups.sortOrder,
      _version: modifierGroups._version,
      createdAt: modifierGroups.createdAt,
      updatedAt: modifierGroups.updatedAt,
    })
    .from(modifierGroups)
    .where(
      and(
        eq(modifierGroups.id, id),
        eq(modifierGroups.organizationId, orgId),
        isNull(modifierGroups.deletedAt),
      ),
    );

  if (!group) return null;

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
    .where(and(eq(modifiers.modifierGroupId, id), isNull(modifiers.deletedAt)))
    .orderBy(asc(modifiers.sortOrder));

  // Fetch linked product IDs
  const links = await db
    .select({ productId: productModifierGroups.productId })
    .from(productModifierGroups)
    .where(
      and(
        eq(productModifierGroups.modifierGroupId, id),
        eq(productModifierGroups.organizationId, orgId),
        isNull(productModifierGroups.deletedAt),
      ),
    );

  return { ...group, modifiers: mods, productIds: links.map((l) => l.productId) };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function createModifierGroup(
  orgId: string,
  input: CreateModifierGroupInput,
  ctx: AuditContext,
) {
  const [created] = await db
    .insert(modifierGroups)
    .values({
      organizationId: orgId,
      name: input.name,
      displayName: input.displayName,
      selectionType: input.selectionType ?? 'single',
      minSelections: input.minSelections ?? 0,
      maxSelections: input.maxSelections ?? 1,
      sortOrder: input.sortOrder ?? 0,
    })
    .returning();

  await db
    .insert(auditLog)
    .values({
      organizationId: ctx.orgId,
      userId: ctx.userId,
      action: 'modifier_group.create',
      entityType: 'modifier_group',
      entityId: created.id,
      changes: { created: input },
      ipAddress: ctx.ip,
    })
    .catch(() => {});

  return created;
}

export async function updateModifierGroup(
  orgId: string,
  id: string,
  input: UpdateModifierGroupInput,
  ctx: AuditContext,
) {
  const [existing] = await db
    .select()
    .from(modifierGroups)
    .where(
      and(
        eq(modifierGroups.id, id),
        eq(modifierGroups.organizationId, orgId),
        isNull(modifierGroups.deletedAt),
      ),
    );

  if (!existing) {
    throw Object.assign(new Error('Modifier group not found'), { statusCode: 404 });
  }

  const [updated] = await db
    .update(modifierGroups)
    .set({
      ...input,
      updatedAt: new Date(),
      _version: existing._version + 1,
    })
    .where(and(eq(modifierGroups.id, id), eq(modifierGroups.organizationId, orgId)))
    .returning();

  await db
    .insert(auditLog)
    .values({
      organizationId: ctx.orgId,
      userId: ctx.userId,
      action: 'modifier_group.update',
      entityType: 'modifier_group',
      entityId: id,
      changes: { before: existing, after: updated },
      ipAddress: ctx.ip,
    })
    .catch(() => {});

  return updated;
}

export async function deleteModifierGroup(orgId: string, id: string, ctx: AuditContext) {
  const [existing] = await db
    .select()
    .from(modifierGroups)
    .where(
      and(
        eq(modifierGroups.id, id),
        eq(modifierGroups.organizationId, orgId),
        isNull(modifierGroups.deletedAt),
      ),
    );

  if (!existing) {
    throw Object.assign(new Error('Modifier group not found'), { statusCode: 404 });
  }

  // Check for active product links
  const [{ count }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(productModifierGroups)
    .where(
      and(eq(productModifierGroups.modifierGroupId, id), isNull(productModifierGroups.deletedAt)),
    );

  if (count > 0) {
    throw Object.assign(
      new Error(`Cannot delete modifier group attached to ${count} active product(s)`),
      { statusCode: 409 },
    );
  }

  const [deleted] = await db
    .update(modifierGroups)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
      _version: existing._version + 1,
    })
    .where(and(eq(modifierGroups.id, id), eq(modifierGroups.organizationId, orgId)))
    .returning();

  await db
    .insert(auditLog)
    .values({
      organizationId: ctx.orgId,
      userId: ctx.userId,
      action: 'modifier_group.delete',
      entityType: 'modifier_group',
      entityId: id,
      changes: { deleted: existing },
      ipAddress: ctx.ip,
    })
    .catch(() => {});

  return deleted;
}

// ---------------------------------------------------------------------------
// Product ↔ Modifier Group linking
// ---------------------------------------------------------------------------

export async function linkModifierGroupToProduct(
  orgId: string,
  productId: string,
  input: LinkInput,
  ctx: AuditContext,
) {
  // Verify product exists in org
  const [product] = await db
    .select({ id: products.id })
    .from(products)
    .where(
      and(
        eq(products.id, productId),
        eq(products.organizationId, orgId),
        isNull(products.deletedAt),
      ),
    );

  if (!product) {
    throw Object.assign(new Error('Product not found'), { statusCode: 404 });
  }

  // Verify modifier group exists in org
  const [group] = await db
    .select({ id: modifierGroups.id })
    .from(modifierGroups)
    .where(
      and(
        eq(modifierGroups.id, input.modifierGroupId),
        eq(modifierGroups.organizationId, orgId),
        isNull(modifierGroups.deletedAt),
      ),
    );

  if (!group) {
    throw Object.assign(new Error('Modifier group not found'), { statusCode: 404 });
  }

  // Check for existing active link
  const [existing] = await db
    .select({ id: productModifierGroups.id })
    .from(productModifierGroups)
    .where(
      and(
        eq(productModifierGroups.productId, productId),
        eq(productModifierGroups.modifierGroupId, input.modifierGroupId),
        eq(productModifierGroups.organizationId, orgId),
        isNull(productModifierGroups.deletedAt),
      ),
    );

  if (existing) {
    throw Object.assign(new Error('Modifier group already linked to this product'), {
      statusCode: 409,
    });
  }

  const [created] = await db
    .insert(productModifierGroups)
    .values({
      organizationId: orgId,
      productId,
      modifierGroupId: input.modifierGroupId,
      sortOrder: input.sortOrder ?? 0,
    })
    .returning();

  await db
    .insert(auditLog)
    .values({
      organizationId: ctx.orgId,
      userId: ctx.userId,
      action: 'product_modifier_group.link',
      entityType: 'product_modifier_group',
      entityId: created.id,
      changes: { productId, modifierGroupId: input.modifierGroupId },
      ipAddress: ctx.ip,
    })
    .catch(() => {});

  return created;
}

export async function unlinkModifierGroupFromProduct(
  orgId: string,
  productId: string,
  groupId: string,
  ctx: AuditContext,
) {
  const [existing] = await db
    .select()
    .from(productModifierGroups)
    .where(
      and(
        eq(productModifierGroups.productId, productId),
        eq(productModifierGroups.modifierGroupId, groupId),
        eq(productModifierGroups.organizationId, orgId),
        isNull(productModifierGroups.deletedAt),
      ),
    );

  if (!existing) {
    throw Object.assign(new Error('Link not found'), { statusCode: 404 });
  }

  await db
    .update(productModifierGroups)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
      _version: existing._version + 1,
    })
    .where(eq(productModifierGroups.id, existing.id));

  await db
    .insert(auditLog)
    .values({
      organizationId: ctx.orgId,
      userId: ctx.userId,
      action: 'product_modifier_group.unlink',
      entityType: 'product_modifier_group',
      entityId: existing.id,
      changes: { productId, modifierGroupId: groupId },
      ipAddress: ctx.ip,
    })
    .catch(() => {});

  return { ok: true };
}
