import { createHash, randomBytes } from 'node:crypto';
import { compare, hash } from 'bcrypt';
import { eq, and, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/connection.js';
import { users, orgMemberships, refreshTokens, auditLog } from '../db/schema/core.js';

const SALT_ROUNDS = 10;
const ACCESS_TOKEN_EXPIRY = '1h';
const PIN_ACCESS_TOKEN_EXPIRY = '12h';
const REFRESH_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export async function loginUser(
  app: FastifyInstance,
  email: string,
  password: string,
  ipAddress?: string,
): Promise<TokenPair> {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (!user || !user.isActive) {
    throw Object.assign(new Error('Invalid email or password'), { statusCode: 401 });
  }

  const valid = await compare(password, user.passwordHash);
  if (!valid) {
    // Log failed attempt if we can resolve org
    const [membership] = await db
      .select()
      .from(orgMemberships)
      .where(eq(orgMemberships.userId, user.id))
      .limit(1);

    if (membership) {
      await db.insert(auditLog).values({
        organizationId: membership.organizationId,
        userId: user.id,
        action: 'auth.login_failed',
        entityType: 'user',
        entityId: user.id,
        changes: { reason: 'invalid_password' },
        ipAddress: ipAddress ?? null,
      });
    }

    throw Object.assign(new Error('Invalid email or password'), { statusCode: 401 });
  }

  // Get first org membership (single-tenant MVP)
  const [membership] = await db
    .select()
    .from(orgMemberships)
    .where(eq(orgMemberships.userId, user.id))
    .limit(1);

  if (!membership) {
    throw Object.assign(new Error('No organization membership found'), { statusCode: 403 });
  }

  const permissions = Array.isArray(membership.permissions)
    ? (membership.permissions as string[])
    : [];

  const tokens = await generateTokens(app, {
    userId: user.id,
    orgId: membership.organizationId,
    role: membership.role,
    permissions,
  });

  // Log successful login
  await db.insert(auditLog).values({
    organizationId: membership.organizationId,
    userId: user.id,
    action: 'auth.login_success',
    entityType: 'user',
    entityId: user.id,
    ipAddress: ipAddress ?? null,
  });

  return tokens;
}

export async function registerUser(
  app: FastifyInstance,
  data: { email: string; password: string; firstName: string; lastName: string },
  ipAddress?: string,
): Promise<TokenPair> {
  const existing = await db.select().from(users).where(eq(users.email, data.email)).limit(1);

  if (existing.length > 0) {
    throw Object.assign(new Error('Email already registered'), { statusCode: 409 });
  }

  const passwordHash = await hash(data.password, SALT_ROUNDS);

  const [user] = await db
    .insert(users)
    .values({
      email: data.email,
      passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
    })
    .returning();

  // Get first org membership — for MVP, the user won't have one yet after register.
  // In a real app, you'd create an org or assign them to one.
  // For now, check if there's a default org.
  const [membership] = await db
    .select()
    .from(orgMemberships)
    .where(eq(orgMemberships.userId, user.id))
    .limit(1);

  if (!membership) {
    throw Object.assign(new Error('No organization membership found. Contact support.'), {
      statusCode: 403,
    });
  }

  const permissions = Array.isArray(membership.permissions)
    ? (membership.permissions as string[])
    : [];

  const tokens = await generateTokens(app, {
    userId: user.id,
    orgId: membership.organizationId,
    role: membership.role,
    permissions,
  });

  await db.insert(auditLog).values({
    organizationId: membership.organizationId,
    userId: user.id,
    action: 'auth.register',
    entityType: 'user',
    entityId: user.id,
    ipAddress: ipAddress ?? null,
  });

  return tokens;
}

export async function refreshAccessToken(app: FastifyInstance, token: string): Promise<TokenPair> {
  const tokenHash = hashToken(token);

  const [stored] = await db
    .select()
    .from(refreshTokens)
    .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)))
    .limit(1);

  if (!stored || stored.expiresAt < new Date()) {
    throw Object.assign(new Error('Invalid or expired refresh token'), { statusCode: 401 });
  }

  // Revoke the old refresh token (rotation)
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.id, stored.id));

  // Look up user and membership
  const [user] = await db.select().from(users).where(eq(users.id, stored.userId)).limit(1);

  if (!user || !user.isActive) {
    throw Object.assign(new Error('User not found or inactive'), { statusCode: 401 });
  }

  const [membership] = await db
    .select()
    .from(orgMemberships)
    .where(eq(orgMemberships.userId, user.id))
    .limit(1);

  if (!membership) {
    throw Object.assign(new Error('No organization membership found'), { statusCode: 403 });
  }

  const permissions = Array.isArray(membership.permissions)
    ? (membership.permissions as string[])
    : [];

  return generateTokens(app, {
    userId: user.id,
    orgId: membership.organizationId,
    role: membership.role,
    permissions,
  });
}

export async function logoutUser(userId: string, token?: string): Promise<void> {
  if (token) {
    // Revoke specific refresh token
    const tokenHash = hashToken(token);
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)));
  } else {
    // Revoke all refresh tokens for user
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
  }
}

export async function pinLogin(
  app: FastifyInstance,
  orgId: string,
  pin: string,
  ipAddress?: string,
): Promise<{ accessToken: string }> {
  // Get all memberships for org that have a PIN set
  const memberships = await db
    .select()
    .from(orgMemberships)
    .where(eq(orgMemberships.organizationId, orgId));

  const withPin = memberships.filter((m) => m.pinHash);

  if (withPin.length === 0) {
    throw Object.assign(new Error('Invalid PIN'), { statusCode: 401 });
  }

  for (const membership of withPin) {
    // Check lockout
    if (membership.pinLockedUntil && membership.pinLockedUntil > new Date()) {
      const retryAfter = Math.ceil((membership.pinLockedUntil.getTime() - Date.now()) / 1000);
      throw Object.assign(new Error('Too many attempts'), {
        statusCode: 429,
        retryAfter,
      });
    }

    const valid = await compare(pin, membership.pinHash!);
    if (!valid) continue;

    // Matched — look up user
    const [user] = await db.select().from(users).where(eq(users.id, membership.userId)).limit(1);

    if (!user || !user.isActive) continue;

    // Reset failed attempts on success
    if (membership.pinFailedAttempts > 0) {
      await db
        .update(orgMemberships)
        .set({ pinFailedAttempts: 0, pinLockedUntil: null })
        .where(eq(orgMemberships.id, membership.id));
    }

    const permissions = Array.isArray(membership.permissions)
      ? (membership.permissions as string[])
      : [];

    const accessToken = app.jwt.sign(
      {
        userId: user.id,
        orgId: membership.organizationId,
        role: membership.role,
        permissions,
      },
      { expiresIn: PIN_ACCESS_TOKEN_EXPIRY },
    );

    // Audit log success
    await db.insert(auditLog).values({
      organizationId: membership.organizationId,
      userId: user.id,
      action: 'auth.pin_login_success',
      entityType: 'user',
      entityId: user.id,
      ipAddress: ipAddress ?? null,
    });

    return { accessToken };
  }

  // No match found — increment failed attempts for all PIN-enabled memberships in this org
  for (const membership of withPin) {
    const newAttempts = membership.pinFailedAttempts + 1;
    const lockedUntil =
      newAttempts >= PIN_MAX_ATTEMPTS ? new Date(Date.now() + PIN_LOCKOUT_MS) : null;

    await db
      .update(orgMemberships)
      .set({ pinFailedAttempts: newAttempts, pinLockedUntil: lockedUntil })
      .where(eq(orgMemberships.id, membership.id));

    // Audit log failure
    const [user] = await db.select().from(users).where(eq(users.id, membership.userId)).limit(1);

    if (user) {
      await db.insert(auditLog).values({
        organizationId: membership.organizationId,
        userId: user.id,
        action: 'auth.pin_login_failed',
        entityType: 'user',
        entityId: user.id,
        changes: { failedAttempts: newAttempts, locked: !!lockedUntil },
        ipAddress: ipAddress ?? null,
      });
    }
  }

  // Check if now locked out
  const anyLocked = withPin.some((m) => m.pinFailedAttempts + 1 >= PIN_MAX_ATTEMPTS);
  if (anyLocked) {
    throw Object.assign(new Error('Too many attempts'), {
      statusCode: 429,
      retryAfter: Math.ceil(PIN_LOCKOUT_MS / 1000),
    });
  }

  throw Object.assign(new Error('Invalid PIN'), { statusCode: 401 });
}

export async function setPin(orgId: string, targetUserId: string, pin: string): Promise<void> {
  // Hash the new PIN
  const pinHash = await hash(pin, SALT_ROUNDS);

  // Check uniqueness within the org — no two memberships should share the same PIN
  const orgMembers = await db
    .select()
    .from(orgMemberships)
    .where(eq(orgMemberships.organizationId, orgId));

  for (const member of orgMembers) {
    if (member.userId === targetUserId || !member.pinHash) continue;
    const duplicate = await compare(pin, member.pinHash);
    if (duplicate) {
      throw Object.assign(new Error('PIN already in use by another staff member'), {
        statusCode: 409,
      });
    }
  }

  const [membership] = await db
    .select()
    .from(orgMemberships)
    .where(and(eq(orgMemberships.userId, targetUserId), eq(orgMemberships.organizationId, orgId)))
    .limit(1);

  if (!membership) {
    throw Object.assign(new Error('Membership not found'), { statusCode: 404 });
  }

  await db
    .update(orgMemberships)
    .set({ pinHash, pinFailedAttempts: 0, pinLockedUntil: null })
    .where(eq(orgMemberships.id, membership.id));
}

async function generateTokens(
  app: FastifyInstance,
  payload: { userId: string; orgId: string; role: string; permissions: string[] },
): Promise<TokenPair> {
  const accessToken = app.jwt.sign(payload, { expiresIn: ACCESS_TOKEN_EXPIRY });

  const rawRefreshToken = randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawRefreshToken);

  await db.insert(refreshTokens).values({
    userId: payload.userId,
    tokenHash,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS),
  });

  return { accessToken, refreshToken: rawRefreshToken };
}
