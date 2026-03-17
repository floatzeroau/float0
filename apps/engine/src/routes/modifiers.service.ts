import { eq, and, isNull, asc, sql, ne } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { modifierGroups, modifiers } from '../db/schema/pos.js';
import { auditLog } from '../db/schema/core.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateModifierInput {
  name: string;
  priceAdjustment?: number;
  isDefault?: boolean;
  isAvailable?: boolean;
  sortOrder?: number;
}

interface UpdateModifierInput {
  name?: string;
  priceAdjustment?: number;
  isDefault?: boolean;
  isAvailable?: boolean;
  sortOrder?: number;
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

export async function listModifiers(orgId: string, groupId: string) {
  // Verify group exists in org
  const [group] = await db
    .select({ id: modifierGroups.id })
    .from(modifierGroups)
    .where(
      and(
        eq(modifierGroups.id, groupId),
        eq(modifierGroups.organizationId, orgId),
        isNull(modifierGroups.deletedAt),
      ),
    );

  if (!group) {
    throw Object.assign(new Error('Modifier group not found'), { statusCode: 404 });
  }

  const rows = await db
    .select({
      id: modifiers.id,
      name: modifiers.name,
      modifierGroupId: modifiers.modifierGroupId,
      priceAdjustment: modifiers.priceAdjustment,
      isDefault: modifiers.isDefault,
      isAvailable: modifiers.isAvailable,
      sortOrder: modifiers.sortOrder,
      _version: modifiers._version,
      createdAt: modifiers.createdAt,
      updatedAt: modifiers.updatedAt,
    })
    .from(modifiers)
    .where(and(eq(modifiers.modifierGroupId, groupId), isNull(modifiers.deletedAt)))
    .orderBy(asc(modifiers.sortOrder));

  return rows;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function createModifier(
  orgId: string,
  groupId: string,
  input: CreateModifierInput,
  ctx: AuditContext,
) {
  // Verify group exists in org
  const [group] = await db
    .select({
      id: modifierGroups.id,
      minSelections: modifierGroups.minSelections,
    })
    .from(modifierGroups)
    .where(
      and(
        eq(modifierGroups.id, groupId),
        eq(modifierGroups.organizationId, orgId),
        isNull(modifierGroups.deletedAt),
      ),
    );

  if (!group) {
    throw Object.assign(new Error('Modifier group not found'), { statusCode: 404 });
  }

  // Enforce single is_default per required group (minSelections >= 1)
  if (input.isDefault && group.minSelections >= 1) {
    const [existingDefault] = await db
      .select({ id: modifiers.id })
      .from(modifiers)
      .where(
        and(
          eq(modifiers.modifierGroupId, groupId),
          eq(modifiers.isDefault, true),
          isNull(modifiers.deletedAt),
        ),
      );

    if (existingDefault) {
      throw Object.assign(new Error('A default modifier already exists in this required group'), {
        statusCode: 409,
      });
    }
  }

  const [created] = await db
    .insert(modifiers)
    .values({
      organizationId: orgId,
      name: input.name,
      modifierGroupId: groupId,
      priceAdjustment: input.priceAdjustment ?? 0,
      isDefault: input.isDefault ?? false,
      isAvailable: input.isAvailable ?? true,
      sortOrder: input.sortOrder ?? 0,
    })
    .returning();

  await db
    .insert(auditLog)
    .values({
      organizationId: ctx.orgId,
      userId: ctx.userId,
      action: 'modifier.create',
      entityType: 'modifier',
      entityId: created.id,
      changes: { created: input },
      ipAddress: ctx.ip,
    })
    .catch(() => {});

  return created;
}

export async function updateModifier(
  orgId: string,
  id: string,
  input: UpdateModifierInput,
  ctx: AuditContext,
) {
  const [existing] = await db
    .select()
    .from(modifiers)
    .where(
      and(eq(modifiers.id, id), eq(modifiers.organizationId, orgId), isNull(modifiers.deletedAt)),
    );

  if (!existing) {
    throw Object.assign(new Error('Modifier not found'), { statusCode: 404 });
  }

  // Enforce single is_default per required group
  if (input.isDefault === true) {
    const [group] = await db
      .select({ minSelections: modifierGroups.minSelections })
      .from(modifierGroups)
      .where(eq(modifierGroups.id, existing.modifierGroupId));

    if (group && group.minSelections >= 1) {
      const [existingDefault] = await db
        .select({ id: modifiers.id })
        .from(modifiers)
        .where(
          and(
            eq(modifiers.modifierGroupId, existing.modifierGroupId),
            eq(modifiers.isDefault, true),
            ne(modifiers.id, id),
            isNull(modifiers.deletedAt),
          ),
        );

      if (existingDefault) {
        throw Object.assign(new Error('A default modifier already exists in this required group'), {
          statusCode: 409,
        });
      }
    }
  }

  const [updated] = await db
    .update(modifiers)
    .set({
      ...input,
      updatedAt: new Date(),
      _version: existing._version + 1,
    })
    .where(and(eq(modifiers.id, id), eq(modifiers.organizationId, orgId)))
    .returning();

  await db
    .insert(auditLog)
    .values({
      organizationId: ctx.orgId,
      userId: ctx.userId,
      action: 'modifier.update',
      entityType: 'modifier',
      entityId: id,
      changes: { before: existing, after: updated },
      ipAddress: ctx.ip,
    })
    .catch(() => {});

  return updated;
}

export async function deleteModifier(orgId: string, id: string, ctx: AuditContext) {
  const [existing] = await db
    .select()
    .from(modifiers)
    .where(
      and(eq(modifiers.id, id), eq(modifiers.organizationId, orgId), isNull(modifiers.deletedAt)),
    );

  if (!existing) {
    throw Object.assign(new Error('Modifier not found'), { statusCode: 404 });
  }

  const [deleted] = await db
    .update(modifiers)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
      _version: existing._version + 1,
    })
    .where(and(eq(modifiers.id, id), eq(modifiers.organizationId, orgId)))
    .returning();

  await db
    .insert(auditLog)
    .values({
      organizationId: ctx.orgId,
      userId: ctx.userId,
      action: 'modifier.delete',
      entityType: 'modifier',
      entityId: id,
      changes: { deleted: existing },
      ipAddress: ctx.ip,
    })
    .catch(() => {});

  return deleted;
}

// ---------------------------------------------------------------------------
// Reorder
// ---------------------------------------------------------------------------

export async function reorderModifiers(
  orgId: string,
  groupId: string,
  items: ReorderItem[],
  ctx: AuditContext,
) {
  // Verify group exists in org
  const [group] = await db
    .select({ id: modifierGroups.id })
    .from(modifierGroups)
    .where(
      and(
        eq(modifierGroups.id, groupId),
        eq(modifierGroups.organizationId, orgId),
        isNull(modifierGroups.deletedAt),
      ),
    );

  if (!group) {
    throw Object.assign(new Error('Modifier group not found'), { statusCode: 404 });
  }

  await db.transaction(async (tx) => {
    for (const item of items) {
      await tx
        .update(modifiers)
        .set({
          sortOrder: item.sortOrder,
          updatedAt: new Date(),
          _version: sql`${modifiers._version} + 1`,
        })
        .where(
          and(
            eq(modifiers.id, item.id),
            eq(modifiers.modifierGroupId, groupId),
            isNull(modifiers.deletedAt),
          ),
        );
    }
  });

  await db
    .insert(auditLog)
    .values({
      organizationId: ctx.orgId,
      userId: ctx.userId,
      action: 'modifier.reorder',
      entityType: 'modifier',
      entityId: groupId,
      changes: { items },
      ipAddress: ctx.ip,
    })
    .catch(() => {});

  return { ok: true };
}
