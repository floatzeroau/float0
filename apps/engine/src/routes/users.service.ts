import { hash } from 'bcrypt';
import { eq, and, sql, desc, isNotNull } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { users, orgMemberships, auditLog } from '../db/schema/core.js';

const SALT_ROUNDS = 10;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InviteInput {
  email: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'manager' | 'staff';
  pin?: string;
}

interface UpdateMemberInput {
  role?: 'admin' | 'manager' | 'staff';
  pin?: string;
}

interface AuditContext {
  orgId: string;
  userId: string;
  ip?: string;
}

interface TeamMember {
  id: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  hasPinSet: boolean;
  lastActiveAt: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// List team members
// ---------------------------------------------------------------------------

export async function listTeamMembers(orgId: string): Promise<TeamMember[]> {
  const rows = await db
    .select({
      id: orgMemberships.id,
      userId: orgMemberships.userId,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: orgMemberships.role,
      isActive: users.isActive,
      pinHash: orgMemberships.pinHash,
      createdAt: orgMemberships.createdAt,
    })
    .from(orgMemberships)
    .innerJoin(users, eq(orgMemberships.userId, users.id))
    .where(eq(orgMemberships.organizationId, orgId));

  // Get last audit activity per user
  const userIds = rows.map((r) => r.userId);
  let lastActiveMap = new Map<string, Date>();

  if (userIds.length > 0) {
    const activityRows = await db
      .select({
        userId: auditLog.userId,
        lastActive: sql<Date>`max(${auditLog.createdAt})`,
      })
      .from(auditLog)
      .where(and(eq(auditLog.organizationId, orgId), sql`${auditLog.userId} = ANY(${userIds})`))
      .groupBy(auditLog.userId);

    lastActiveMap = new Map(activityRows.map((r) => [r.userId, r.lastActive]));
  }

  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    role: row.role,
    isActive: row.isActive,
    hasPinSet: !!row.pinHash,
    lastActiveAt: lastActiveMap.get(row.userId)?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// Invite user
// ---------------------------------------------------------------------------

export async function inviteUser(orgId: string, input: InviteInput, ctx: AuditContext) {
  const [existing] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);

  if (existing) {
    const [membership] = await db
      .select()
      .from(orgMemberships)
      .where(and(eq(orgMemberships.userId, existing.id), eq(orgMemberships.organizationId, orgId)))
      .limit(1);

    if (membership) {
      throw Object.assign(new Error('User is already a member of this organization'), {
        statusCode: 409,
      });
    }

    const [newMembership] = await db
      .insert(orgMemberships)
      .values({ userId: existing.id, organizationId: orgId, role: input.role })
      .returning();

    if (input.pin) {
      const pinHash = await hash(input.pin, SALT_ROUNDS);
      await db
        .update(orgMemberships)
        .set({ pinHash })
        .where(eq(orgMemberships.id, newMembership.id));
    }

    await db
      .insert(auditLog)
      .values({
        organizationId: ctx.orgId,
        userId: ctx.userId,
        action: 'user.invite',
        entityType: 'user',
        entityId: existing.id,
        changes: { email: input.email, role: input.role },
        ipAddress: ctx.ip,
      })
      .catch(() => {});

    return {
      userId: existing.id,
      membershipId: newMembership.id,
      email: input.email,
      role: input.role,
    };
  }

  // Create new user with temp password
  const tempPassword = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 16);
  const passwordHash = await hash(tempPassword, SALT_ROUNDS);

  const [user] = await db
    .insert(users)
    .values({
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      isActive: true,
    })
    .returning();

  const [membership] = await db
    .insert(orgMemberships)
    .values({ userId: user.id, organizationId: orgId, role: input.role })
    .returning();

  if (input.pin) {
    const pinHash = await hash(input.pin, SALT_ROUNDS);
    await db.update(orgMemberships).set({ pinHash }).where(eq(orgMemberships.id, membership.id));
  }

  await db
    .insert(auditLog)
    .values({
      organizationId: ctx.orgId,
      userId: ctx.userId,
      action: 'user.invite',
      entityType: 'user',
      entityId: user.id,
      changes: { email: input.email, role: input.role, newUser: true },
      ipAddress: ctx.ip,
    })
    .catch(() => {});

  return { userId: user.id, membershipId: membership.id, email: input.email, role: input.role };
}

// ---------------------------------------------------------------------------
// Update member (role, PIN)
// ---------------------------------------------------------------------------

export async function updateMember(
  orgId: string,
  membershipId: string,
  input: UpdateMemberInput,
  ctx: AuditContext,
) {
  const [membership] = await db
    .select()
    .from(orgMemberships)
    .where(and(eq(orgMemberships.id, membershipId), eq(orgMemberships.organizationId, orgId)))
    .limit(1);

  if (!membership) {
    throw Object.assign(new Error('Membership not found'), { statusCode: 404 });
  }

  // Prevent changing owner role
  if (membership.role === 'owner') {
    throw Object.assign(new Error('Cannot modify owner role'), { statusCode: 403 });
  }

  const updates: Record<string, unknown> = {};

  if (input.role) {
    updates.role = input.role;
  }

  if (input.pin) {
    updates.pinHash = await hash(input.pin, SALT_ROUNDS);
    updates.pinFailedAttempts = 0;
    updates.pinLockedUntil = null;
  }

  if (Object.keys(updates).length > 0) {
    await db.update(orgMemberships).set(updates).where(eq(orgMemberships.id, membershipId));
  }

  await db
    .insert(auditLog)
    .values({
      organizationId: ctx.orgId,
      userId: ctx.userId,
      action: 'user.update',
      entityType: 'user',
      entityId: membership.userId,
      changes: { role: input.role, pinReset: !!input.pin },
      ipAddress: ctx.ip,
    })
    .catch(() => {});

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Deactivate member
// ---------------------------------------------------------------------------

export async function deactivateMember(orgId: string, membershipId: string, ctx: AuditContext) {
  const [membership] = await db
    .select()
    .from(orgMemberships)
    .where(and(eq(orgMemberships.id, membershipId), eq(orgMemberships.organizationId, orgId)))
    .limit(1);

  if (!membership) {
    throw Object.assign(new Error('Membership not found'), { statusCode: 404 });
  }

  if (membership.role === 'owner') {
    throw Object.assign(new Error('Cannot deactivate the owner'), { statusCode: 403 });
  }

  // Deactivate the user account
  await db
    .update(users)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(users.id, membership.userId));

  await db
    .insert(auditLog)
    .values({
      organizationId: ctx.orgId,
      userId: ctx.userId,
      action: 'user.deactivate',
      entityType: 'user',
      entityId: membership.userId,
      ipAddress: ctx.ip,
    })
    .catch(() => {});

  return { ok: true };
}
