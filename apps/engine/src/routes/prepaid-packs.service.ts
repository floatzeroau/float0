import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { prepaidPacks } from '../db/schema/pos.js';

export async function listPacks(orgId: string) {
  return db
    .select()
    .from(prepaidPacks)
    .where(and(eq(prepaidPacks.organizationId, orgId), isNull(prepaidPacks.deletedAt)));
}

export async function getPack(orgId: string, packId: string) {
  const [pack] = await db
    .select()
    .from(prepaidPacks)
    .where(
      and(
        eq(prepaidPacks.id, packId),
        eq(prepaidPacks.organizationId, orgId),
        isNull(prepaidPacks.deletedAt),
      ),
    )
    .limit(1);

  if (!pack) {
    throw Object.assign(new Error('Pack not found'), { statusCode: 404 });
  }

  return pack;
}

export async function createPack(
  orgId: string,
  data: {
    name: string;
    description?: string | null;
    packSize: number;
    price: number;
    perItemValue: number;
    eligibleProductIds?: string[] | null;
    isActive?: boolean;
    allowCustomSize?: boolean;
  },
) {
  const [pack] = await db
    .insert(prepaidPacks)
    .values({
      organizationId: orgId,
      name: data.name,
      description: data.description ?? null,
      packSize: data.packSize,
      price: data.price,
      perItemValue: data.perItemValue,
      eligibleProductIds: data.eligibleProductIds ?? null,
      isActive: data.isActive ?? true,
      allowCustomSize: data.allowCustomSize ?? false,
    })
    .returning();

  return pack;
}

export async function updatePack(
  orgId: string,
  packId: string,
  data: {
    name?: string;
    description?: string | null;
    packSize?: number;
    price?: number;
    perItemValue?: number;
    eligibleProductIds?: string[] | null;
    isActive?: boolean;
    allowCustomSize?: boolean;
  },
) {
  // Ensure pack exists
  await getPack(orgId, packId);

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined) updates.name = data.name;
  if (data.description !== undefined) updates.description = data.description;
  if (data.packSize !== undefined) updates.packSize = data.packSize;
  if (data.price !== undefined) updates.price = data.price;
  if (data.perItemValue !== undefined) updates.perItemValue = data.perItemValue;
  if (data.eligibleProductIds !== undefined) updates.eligibleProductIds = data.eligibleProductIds;
  if (data.isActive !== undefined) updates.isActive = data.isActive;
  if (data.allowCustomSize !== undefined) updates.allowCustomSize = data.allowCustomSize;

  const [updated] = await db
    .update(prepaidPacks)
    .set(updates)
    .where(eq(prepaidPacks.id, packId))
    .returning();

  return updated;
}

export async function deletePack(orgId: string, packId: string) {
  await getPack(orgId, packId);

  await db
    .update(prepaidPacks)
    .set({ deletedAt: new Date(), isActive: false, updatedAt: new Date() })
    .where(eq(prepaidPacks.id, packId));
}

export async function listActivePacksForOrg(orgId: string) {
  return db
    .select({
      id: prepaidPacks.id,
      name: prepaidPacks.name,
      description: prepaidPacks.description,
      packSize: prepaidPacks.packSize,
      price: prepaidPacks.price,
      perItemValue: prepaidPacks.perItemValue,
      eligibleProductIds: prepaidPacks.eligibleProductIds,
      allowCustomSize: prepaidPacks.allowCustomSize,
    })
    .from(prepaidPacks)
    .where(
      and(
        eq(prepaidPacks.organizationId, orgId),
        eq(prepaidPacks.isActive, true),
        isNull(prepaidPacks.deletedAt),
      ),
    );
}
