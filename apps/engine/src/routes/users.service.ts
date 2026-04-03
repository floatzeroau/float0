import { randomBytes } from 'node:crypto';
import { hash, compare } from 'bcrypt';
import { eq, and, or, ilike } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { ROLE_HIERARCHY } from '@float0/shared';
import type { OrgRole } from '@float0/shared';
import { db } from '../db/connection.js';
import { users, orgMemberships, organizations, auditLog } from '../db/schema/core.js';
import { getEmailService } from '../services/email-service.js';

const SALT_ROUNDS = 10;
const SETUP_TOKEN_EXPIRY = '72h';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuditContext {
  orgId: string;
  userId: string;
  ip?: string;
}

interface InviteInput {
  email: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'manager' | 'staff';
  posPin?: string;
}

interface ListUsersOptions {
  role?: string;
  search?: string;
}

// ---------------------------------------------------------------------------
// Invite
// ---------------------------------------------------------------------------

export async function inviteUser(
  app: FastifyInstance,
  orgId: string,
  input: InviteInput,
  ctx: AuditContext,
) {
  // Check inviter can't invite role >= own
  const [inviterMembership] = await db
    .select()
    .from(orgMemberships)
    .where(and(eq(orgMemberships.userId, ctx.userId), eq(orgMemberships.organizationId, orgId)))
    .limit(1);

  if (!inviterMembership) {
    throw Object.assign(new Error('Inviter membership not found'), { statusCode: 403 });
  }

  const inviterLevel = ROLE_HIERARCHY[inviterMembership.role as OrgRole] ?? 0;
  const targetLevel = ROLE_HIERARCHY[input.role as OrgRole] ?? 0;

  if (targetLevel >= inviterLevel) {
    throw Object.assign(
      new Error(`Cannot invite a user with ${input.role} role (equal or higher than your own)`),
      { statusCode: 403 },
    );
  }

  // Check email unique within org
  const [existingUser] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);

  if (existingUser) {
    const [existingMembership] = await db
      .select()
      .from(orgMemberships)
      .where(
        and(eq(orgMemberships.userId, existingUser.id), eq(orgMemberships.organizationId, orgId)),
      )
      .limit(1);

    if (existingMembership) {
      throw Object.assign(new Error('User already belongs to this organization'), {
        statusCode: 409,
      });
    }
  }

  // Check posPin uniqueness within org if provided
  if (input.posPin) {
    const orgMembers = await db
      .select()
      .from(orgMemberships)
      .where(eq(orgMemberships.organizationId, orgId));

    for (const member of orgMembers) {
      if (!member.pinHash) continue;
      const duplicate = await compare(input.posPin, member.pinHash);
      if (duplicate) {
        throw Object.assign(new Error('PIN already in use by another staff member'), {
          statusCode: 409,
        });
      }
    }
  }

  // Create user with placeholder password hash (invited users set password via setup link)
  const placeholderHash = await hash(randomBytes(32).toString('hex'), SALT_ROUNDS);
  const pinHash = input.posPin ? await hash(input.posPin, SALT_ROUNDS) : null;

  const { user, membership } = await db.transaction(async (tx) => {
    let newUser;

    if (existingUser) {
      // User exists in another org, reuse account
      newUser = existingUser;
    } else {
      [newUser] = await tx
        .insert(users)
        .values({
          email: input.email,
          passwordHash: placeholderHash,
          firstName: input.firstName,
          lastName: input.lastName,
          isActive: false,
        })
        .returning();
    }

    const [newMembership] = await tx
      .insert(orgMemberships)
      .values({
        userId: newUser.id,
        organizationId: orgId,
        role: input.role,
        pinHash,
      })
      .returning();

    await tx.insert(auditLog).values({
      organizationId: ctx.orgId,
      userId: ctx.userId,
      action: 'user.invite',
      entityType: 'user',
      entityId: newUser.id,
      changes: { email: input.email, role: input.role },
      ipAddress: ctx.ip,
    });

    return { user: newUser, membership: newMembership };
  });

  // Generate setup token
  const setupToken = app.jwt.sign(
    { userId: user.id, orgId, role: membership.role, permissions: [], purpose: 'account-setup' },
    { expiresIn: SETUP_TOKEN_EXPIRY },
  );

  // Send invite email
  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const [inviter] = await db
    .select({ firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(eq(users.id, ctx.userId))
    .limit(1);

  const baseUrl = process.env.HUB_URL ?? 'http://localhost:3000';
  const setupUrl = `${baseUrl}/setup-account?token=${setupToken}`;

  const emailService = getEmailService();
  await emailService.sendInvite(input.email, {
    recipientName: `${input.firstName} ${input.lastName}`.trim(),
    orgName: org?.name ?? 'your organization',
    inviterName: inviter ? `${inviter.firstName} ${inviter.lastName}`.trim() : 'A team member',
    role: input.role,
    setupUrl,
  });

  return {
    userId: user.id,
    membershipId: membership.id,
    email: user.email,
    role: membership.role,
    setupToken,
  };
}

// ---------------------------------------------------------------------------
// Setup Account
// ---------------------------------------------------------------------------

export async function setupAccount(
  app: FastifyInstance,
  token: string,
  password: string,
  ipAddress?: string,
) {
  // Verify token
  let payload: { userId: string; orgId: string; purpose?: string };
  try {
    payload = app.jwt.verify(token);
  } catch {
    throw Object.assign(new Error('Invalid or expired setup token'), { statusCode: 401 });
  }

  if (payload.purpose !== 'account-setup') {
    throw Object.assign(new Error('Invalid token purpose'), { statusCode: 401 });
  }

  const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);

  if (!user) {
    throw Object.assign(new Error('User not found'), { statusCode: 404 });
  }

  const passwordHash = await hash(password, SALT_ROUNDS);

  await db
    .update(users)
    .set({ passwordHash, isActive: true, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  await db
    .insert(auditLog)
    .values({
      organizationId: payload.orgId,
      userId: user.id,
      action: 'auth.account_setup',
      entityType: 'user',
      entityId: user.id,
      ipAddress: ipAddress ?? null,
    })
    .catch(() => {});

  return { message: 'Account setup complete. You can now log in.' };
}

// ---------------------------------------------------------------------------
// List Users
// ---------------------------------------------------------------------------

export async function listOrgUsers(orgId: string, options: ListUsersOptions = {}) {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      phone: users.phone,
      isActive: users.isActive,
      role: orgMemberships.role,
      hasPosPin: orgMemberships.pinHash,
      createdAt: users.createdAt,
    })
    .from(orgMemberships)
    .innerJoin(users, eq(users.id, orgMemberships.userId))
    .where(
      and(
        eq(orgMemberships.organizationId, orgId),
        ...(options.role
          ? [eq(orgMemberships.role, options.role as 'owner' | 'admin' | 'manager' | 'staff')]
          : []),
        ...(options.search
          ? [
              or(
                ilike(users.firstName, `%${options.search}%`),
                ilike(users.lastName, `%${options.search}%`),
                ilike(users.email, `%${options.search}%`),
              ),
            ]
          : []),
      ),
    );

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    phone: row.phone,
    isActive: row.isActive,
    role: row.role,
    hasPosPin: !!row.hasPosPin,
    createdAt: row.createdAt,
  }));
}

// ---------------------------------------------------------------------------
// Update Org Member (role / PIN)
// ---------------------------------------------------------------------------

interface UpdateMemberInput {
  role?: 'admin' | 'manager' | 'staff';
  pin?: string;
}

export async function updateOrgMember(
  orgId: string,
  targetUserId: string,
  input: UpdateMemberInput,
  ctx: AuditContext,
) {
  const [membership] = await db
    .select()
    .from(orgMemberships)
    .where(and(eq(orgMemberships.userId, targetUserId), eq(orgMemberships.organizationId, orgId)))
    .limit(1);

  if (!membership) {
    throw Object.assign(new Error('User not found in this organization'), { statusCode: 404 });
  }

  if (membership.role === 'owner') {
    throw Object.assign(new Error('Cannot modify the organization owner'), { statusCode: 403 });
  }

  const updates: Record<string, unknown> = {};

  if (input.role) {
    const callerLevel =
      ROLE_HIERARCHY[
        (
          await db
            .select({ role: orgMemberships.role })
            .from(orgMemberships)
            .where(
              and(eq(orgMemberships.userId, ctx.userId), eq(orgMemberships.organizationId, orgId)),
            )
            .limit(1)
        )[0]?.role as OrgRole
      ] ?? 0;
    const targetLevel = ROLE_HIERARCHY[input.role as OrgRole] ?? 0;

    if (targetLevel >= callerLevel) {
      throw Object.assign(
        new Error(`Cannot assign ${input.role} role (equal or higher than your own)`),
        { statusCode: 403 },
      );
    }

    updates.role = input.role;
  }

  if (input.pin) {
    // Check PIN uniqueness within org
    const orgMembers = await db
      .select()
      .from(orgMemberships)
      .where(eq(orgMemberships.organizationId, orgId));

    for (const member of orgMembers) {
      if (!member.pinHash || member.userId === targetUserId) continue;
      const duplicate = await compare(input.pin, member.pinHash);
      if (duplicate) {
        throw Object.assign(new Error('PIN already in use by another staff member'), {
          statusCode: 409,
        });
      }
    }

    updates.pinHash = await hash(input.pin, SALT_ROUNDS);
  }

  if (Object.keys(updates).length === 0) {
    return { message: 'No changes' };
  }

  await db
    .update(orgMemberships)
    .set(updates)
    .where(and(eq(orgMemberships.userId, targetUserId), eq(orgMemberships.organizationId, orgId)));

  await db
    .insert(auditLog)
    .values({
      organizationId: ctx.orgId,
      userId: ctx.userId,
      action: 'user.update',
      entityType: 'user',
      entityId: targetUserId,
      changes: { role: input.role, pinChanged: !!input.pin },
      ipAddress: ctx.ip,
    })
    .catch(() => {});

  return { message: 'Member updated' };
}

// ---------------------------------------------------------------------------
// Deactivate User
// ---------------------------------------------------------------------------

export async function deactivateUser(orgId: string, targetUserId: string, ctx: AuditContext) {
  // Verify the target belongs to the org
  const [membership] = await db
    .select()
    .from(orgMemberships)
    .where(and(eq(orgMemberships.userId, targetUserId), eq(orgMemberships.organizationId, orgId)))
    .limit(1);

  if (!membership) {
    throw Object.assign(new Error('User not found in this organization'), { statusCode: 404 });
  }

  // Can't deactivate yourself
  if (targetUserId === ctx.userId) {
    throw Object.assign(new Error('Cannot deactivate your own account'), { statusCode: 400 });
  }

  // Can't deactivate owner
  if (membership.role === 'owner') {
    throw Object.assign(new Error('Cannot deactivate the organization owner'), {
      statusCode: 403,
    });
  }

  await db
    .update(users)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(users.id, targetUserId));

  await db
    .insert(auditLog)
    .values({
      organizationId: ctx.orgId,
      userId: ctx.userId,
      action: 'user.deactivate',
      entityType: 'user',
      entityId: targetUserId,
      ipAddress: ctx.ip,
    })
    .catch(() => {});

  return { message: 'User deactivated' };
}
