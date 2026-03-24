import { hash } from 'bcrypt';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { users, orgMemberships, auditLog } from '../db/schema/core.js';

const SALT_ROUNDS = 10;
const TEMP_PASSWORD_LENGTH = 16;

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
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Invite user
// ---------------------------------------------------------------------------

export async function inviteUser(orgId: string, input: InviteInput, ctx: AuditContext) {
  // Check for duplicate email
  const [existing] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);

  if (existing) {
    // Check if already in this org
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

    // Add existing user to org
    const [newMembership] = await db
      .insert(orgMemberships)
      .values({
        userId: existing.id,
        organizationId: orgId,
        role: input.role,
      })
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
        changes: { email: input.email, role: input.role, existingUser: true },
        ipAddress: ctx.ip,
      })
      .catch(() => {});

    return {
      userId: existing.id,
      membershipId: newMembership.id,
      email: input.email,
      firstName: existing.firstName,
      lastName: existing.lastName,
      role: input.role,
    };
  }

  // Create new user with temporary password
  const tempPassword = Array.from(crypto.getRandomValues(new Uint8Array(TEMP_PASSWORD_LENGTH)))
    .map((b) => b.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, TEMP_PASSWORD_LENGTH);
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
    .values({
      userId: user.id,
      organizationId: orgId,
      role: input.role,
    })
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

  return {
    userId: user.id,
    membershipId: membership.id,
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    role: input.role,
  };
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
      createdAt: orgMemberships.createdAt,
    })
    .from(orgMemberships)
    .innerJoin(users, eq(orgMemberships.userId, users.id))
    .where(eq(orgMemberships.organizationId, orgId));

  return rows;
}
