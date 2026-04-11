import { createHash, randomBytes } from 'node:crypto';
import { compare, hash } from 'bcrypt';
import { eq, and, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '../middleware/auth.js';
import type { CustomerJwtPayload } from '../middleware/require-customer-auth.js';
import { db } from '../db/connection.js';
import { organizations } from '../db/schema/core.js';
import { customers, customerRefreshTokens } from '../db/schema/pos.js';

const SALT_ROUNDS = 10;
const ACCESS_TOKEN_EXPIRY = '7d';
const REFRESH_TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SETUP_TOKEN_EXPIRY = '1h';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

interface CustomerTokenPair {
  accessToken: string;
  refreshToken: string;
}

// ── Shared helpers ────────────────────────────────────

export async function resolveOrgBySlug(slug: string) {
  const [org] = await db
    .select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);

  if (!org) {
    throw Object.assign(new Error('Organization not found'), { statusCode: 404 });
  }

  return org;
}

async function generateCustomerTokens(
  app: FastifyInstance,
  payload: { customerId: string; orgId: string },
): Promise<CustomerTokenPair> {
  const jwtPayload: CustomerJwtPayload = {
    customerId: payload.customerId,
    orgId: payload.orgId,
    role: 'customer',
  };

  const accessToken = app.jwt.sign(jwtPayload as unknown as JwtPayload, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });

  const rawRefreshToken = randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawRefreshToken);

  await db.insert(customerRefreshTokens).values({
    customerId: payload.customerId,
    tokenHash,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS),
  });

  return { accessToken, refreshToken: rawRefreshToken };
}

// ── Register ──────────────────────────────────────────

export async function registerCustomer(
  app: FastifyInstance,
  orgId: string,
  data: { email: string; password: string; firstName: string; lastName: string; phone?: string },
): Promise<
  CustomerTokenPair & {
    customer: { id: string; firstName: string; lastName: string; email: string };
  }
> {
  const passwordHash = await hash(data.password, SALT_ROUNDS);

  // Check duplicate email within org
  const [existing] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.organizationId, orgId), eq(customers.email, data.email)))
    .limit(1);

  if (existing) {
    throw Object.assign(new Error('Email already registered for this organization'), {
      statusCode: 409,
    });
  }

  const [customer] = await db
    .insert(customers)
    .values({
      organizationId: orgId,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone ?? null,
      passwordHash,
      emailVerified: false,
      lastLoginAt: new Date(),
    })
    .returning();

  const tokens = await generateCustomerTokens(app, {
    customerId: customer.id,
    orgId,
  });

  return {
    ...tokens,
    customer: {
      id: customer.id,
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email!,
    },
  };
}

// ── Login ─────────────────────────────────────────────

export async function loginCustomer(
  app: FastifyInstance,
  orgId: string,
  email: string,
  password: string,
): Promise<
  CustomerTokenPair & {
    customer: { id: string; firstName: string; lastName: string; email: string };
  }
> {
  const [customer] = await db
    .select()
    .from(customers)
    .where(
      and(
        eq(customers.organizationId, orgId),
        eq(customers.email, email),
        isNull(customers.deletedAt),
      ),
    )
    .limit(1);

  if (!customer) {
    throw Object.assign(new Error('Invalid email or password'), { statusCode: 401 });
  }

  // POS-created customer without password → return setup token
  if (!customer.passwordHash) {
    const setupPayload = {
      customerId: customer.id,
      orgId,
      role: 'customer' as const,
      purpose: 'customer-setup',
    };

    const setupToken = app.jwt.sign(setupPayload as unknown as JwtPayload, {
      expiresIn: SETUP_TOKEN_EXPIRY,
    });

    const err = Object.assign(new Error('Account requires password setup'), {
      statusCode: 400,
      code: 'SETUP_REQUIRED',
      setupToken,
      customerId: customer.id,
    });
    throw err;
  }

  const valid = await compare(password, customer.passwordHash);
  if (!valid) {
    throw Object.assign(new Error('Invalid email or password'), { statusCode: 401 });
  }

  // Update last login
  await db.update(customers).set({ lastLoginAt: new Date() }).where(eq(customers.id, customer.id));

  const tokens = await generateCustomerTokens(app, {
    customerId: customer.id,
    orgId,
  });

  return {
    ...tokens,
    customer: {
      id: customer.id,
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email!,
    },
  };
}

// ── Setup (POS-created customer sets password) ────────

export async function setupCustomerPassword(
  app: FastifyInstance,
  setupToken: string,
  password: string,
): Promise<
  CustomerTokenPair & {
    customer: { id: string; firstName: string; lastName: string; email: string };
  }
> {
  let payload: CustomerJwtPayload & { purpose?: string };
  try {
    payload = app.jwt.verify<CustomerJwtPayload & { purpose?: string }>(setupToken);
  } catch {
    throw Object.assign(new Error('Invalid or expired setup token'), { statusCode: 401 });
  }

  if (payload.purpose !== 'customer-setup' || payload.role !== 'customer') {
    throw Object.assign(new Error('Invalid setup token'), { statusCode: 400 });
  }

  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, payload.customerId))
    .limit(1);

  if (!customer) {
    throw Object.assign(new Error('Customer not found'), { statusCode: 404 });
  }

  const passwordHash = await hash(password, SALT_ROUNDS);

  await db
    .update(customers)
    .set({ passwordHash, lastLoginAt: new Date(), updatedAt: new Date() })
    .where(eq(customers.id, customer.id));

  const tokens = await generateCustomerTokens(app, {
    customerId: customer.id,
    orgId: payload.orgId,
  });

  return {
    ...tokens,
    customer: {
      id: customer.id,
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email!,
    },
  };
}

// ── Refresh ───────────────────────────────────────────

export async function refreshCustomerToken(
  app: FastifyInstance,
  token: string,
): Promise<CustomerTokenPair> {
  const tokenHash = hashToken(token);

  const [stored] = await db
    .select()
    .from(customerRefreshTokens)
    .where(
      and(eq(customerRefreshTokens.tokenHash, tokenHash), isNull(customerRefreshTokens.revokedAt)),
    )
    .limit(1);

  if (!stored || stored.expiresAt < new Date()) {
    throw Object.assign(new Error('Invalid or expired refresh token'), { statusCode: 401 });
  }

  // Revoke old token (rotation)
  await db
    .update(customerRefreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(customerRefreshTokens.id, stored.id));

  // Look up customer
  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, stored.customerId), isNull(customers.deletedAt)))
    .limit(1);

  if (!customer) {
    throw Object.assign(new Error('Customer not found'), { statusCode: 401 });
  }

  return generateCustomerTokens(app, {
    customerId: customer.id,
    orgId: customer.organizationId,
  });
}

// ── Profile ───────────────────────────────────────────

export async function getCustomerProfile(customerId: string) {
  const [customer] = await db
    .select({
      id: customers.id,
      firstName: customers.firstName,
      lastName: customers.lastName,
      email: customers.email,
      phone: customers.phone,
      emailVerified: customers.emailVerified,
      loyaltyTier: customers.loyaltyTier,
      loyaltyBalance: customers.loyaltyBalance,
      createdAt: customers.createdAt,
    })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);

  if (!customer) {
    throw Object.assign(new Error('Customer not found'), { statusCode: 404 });
  }

  return customer;
}

export async function updateCustomerProfile(
  customerId: string,
  data: { firstName?: string; lastName?: string; phone?: string },
) {
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.firstName !== undefined) updates.firstName = data.firstName;
  if (data.lastName !== undefined) updates.lastName = data.lastName;
  if (data.phone !== undefined) updates.phone = data.phone;

  await db.update(customers).set(updates).where(eq(customers.id, customerId));

  return getCustomerProfile(customerId);
}
