import { eq } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { organizations, auditLog } from '../db/schema/core.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuditContext {
  orgId: string;
  userId: string;
  ip?: string;
}

interface AddressInput {
  street?: string;
  suburb?: string;
  state?: string;
  postcode?: string;
}

interface UpdateOrgInput {
  name?: string;
  abn?: string | null;
  address?: AddressInput | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  timezone?: string;
  settings?: Record<string, unknown>;
}

type SettingsInput = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getOrganization(orgId: string) {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);

  return org ?? null;
}

export async function getOrganizationSettings(orgId: string) {
  const [row] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  return (row?.settings as Record<string, unknown>) ?? null;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function updateOrganization(orgId: string, input: UpdateOrgInput, ctx: AuditContext) {
  const [existing] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!existing) {
    throw Object.assign(new Error('Organization not found'), { statusCode: 404 });
  }

  const [updated] = await db
    .update(organizations)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId))
    .returning();

  await db
    .insert(auditLog)
    .values({
      organizationId: ctx.orgId,
      userId: ctx.userId,
      action: 'organization.update',
      entityType: 'organization',
      entityId: orgId,
      changes: { before: existing, after: updated },
      ipAddress: ctx.ip,
    })
    .catch(() => {});

  return updated;
}

export async function mergeOrganizationSettings(
  orgId: string,
  partial: SettingsInput,
  ctx: AuditContext,
) {
  const [existing] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!existing) {
    throw Object.assign(new Error('Organization not found'), { statusCode: 404 });
  }

  const currentSettings = (existing.settings as Record<string, unknown>) ?? {};
  const merged = deepMerge(currentSettings, partial);

  const [updated] = await db
    .update(organizations)
    .set({
      settings: merged,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId))
    .returning();

  await db
    .insert(auditLog)
    .values({
      organizationId: ctx.orgId,
      userId: ctx.userId,
      action: 'organization.settings_update',
      entityType: 'organization',
      entityId: orgId,
      changes: { before: currentSettings, after: merged },
      ipAddress: ctx.ip,
    })
    .catch(() => {});

  return updated.settings as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    const targetVal = target[key];
    const sourceVal = source[key];

    if (isPlainObject(targetVal) && isPlainObject(sourceVal)) {
      result[key] = deepMerge(targetVal, sourceVal);
    } else {
      result[key] = sourceVal;
    }
  }

  return result;
}
