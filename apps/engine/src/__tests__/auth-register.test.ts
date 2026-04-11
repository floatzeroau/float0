import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// ── Schema validation tests (no DB needed) ────────────────

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[a-zA-Z]/, 'Password must contain at least one letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

const abnSchema = z
  .string()
  .regex(/^\d{11}$/, 'ABN must be exactly 11 digits')
  .optional();

const registerSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  orgName: z.string().min(1, 'Organization name is required'),
  abn: abnSchema,
  timezone: z.string().default('Australia/Melbourne'),
});

describe('register schema validation', () => {
  const validPayload = {
    email: 'owner@example.com',
    password: 'Secret123',
    firstName: 'Jane',
    lastName: 'Doe',
    orgName: 'My Cafe',
  };

  it('accepts a valid registration payload', () => {
    const result = registerSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timezone).toBe('Australia/Melbourne');
    }
  });

  it('accepts all optional fields', () => {
    const result = registerSchema.safeParse({
      ...validPayload,
      phone: '+61400000000',
      abn: '12345678901',
      timezone: 'Australia/Sydney',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.abn).toBe('12345678901');
      expect(result.data.timezone).toBe('Australia/Sydney');
    }
  });

  it('rejects missing email', () => {
    const { email: _, ...payload } = validPayload;
    const result = registerSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it('rejects invalid email', () => {
    const result = registerSchema.safeParse({ ...validPayload, email: 'not-an-email' });
    expect(result.success).toBe(false);
  });

  it('rejects missing orgName', () => {
    const { orgName: _, ...payload } = validPayload;
    const result = registerSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it('rejects empty orgName', () => {
    const result = registerSchema.safeParse({ ...validPayload, orgName: '' });
    expect(result.success).toBe(false);
  });

  it('rejects missing firstName', () => {
    const { firstName: _, ...payload } = validPayload;
    const result = registerSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it('rejects missing lastName', () => {
    const { lastName: _, ...payload } = validPayload;
    const result = registerSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it('rejects password shorter than 8 chars', () => {
    const result = registerSchema.safeParse({ ...validPayload, password: 'Ab1' });
    expect(result.success).toBe(false);
  });

  it('rejects password without a letter', () => {
    const result = registerSchema.safeParse({ ...validPayload, password: '12345678' });
    expect(result.success).toBe(false);
  });

  it('rejects password without a number', () => {
    const result = registerSchema.safeParse({ ...validPayload, password: 'abcdefgh' });
    expect(result.success).toBe(false);
  });

  describe('ABN validation', () => {
    it('accepts a valid 11-digit ABN', () => {
      const result = registerSchema.safeParse({ ...validPayload, abn: '12345678901' });
      expect(result.success).toBe(true);
    });

    it('rejects ABN with fewer than 11 digits', () => {
      const result = registerSchema.safeParse({ ...validPayload, abn: '1234567890' });
      expect(result.success).toBe(false);
    });

    it('rejects ABN with more than 11 digits', () => {
      const result = registerSchema.safeParse({ ...validPayload, abn: '123456789012' });
      expect(result.success).toBe(false);
    });

    it('rejects ABN with non-digit characters', () => {
      const result = registerSchema.safeParse({ ...validPayload, abn: '1234567890a' });
      expect(result.success).toBe(false);
    });

    it('rejects ABN with spaces', () => {
      const result = registerSchema.safeParse({ ...validPayload, abn: '12 345 678 901' });
      expect(result.success).toBe(false);
    });

    it('allows omitting ABN', () => {
      const result = registerSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.abn).toBeUndefined();
      }
    });
  });
});

// ── Service function tests (mocked DB) ────────────────────

// Mock db before importing service
const mockInsertReturning = vi.fn();
const mockInsertValues = vi.fn(() => ({ returning: mockInsertReturning }));
const mockInsert = vi.fn(() => ({ values: mockInsertValues }));
const mockSelectLimit = vi.fn();
const mockSelectWhere = vi.fn(() => ({ limit: mockSelectLimit }));
const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere }));
const mockTransaction = vi.fn();

vi.mock('../db/connection.js', () => ({
  db: {
    select: () => ({ from: mockSelectFrom }),
    insert: mockInsert,
    transaction: mockTransaction,
  },
}));

vi.mock('bcrypt', () => ({
  hash: vi.fn().mockResolvedValue('$2b$10$hashedpassword'),
  compare: vi.fn(),
}));

vi.mock('@float0/shared', () => ({
  getEffectivePermissions: vi.fn().mockReturnValue(['billing.manage', 'org.manage']),
  slugify: vi.fn().mockReturnValue('test-org'),
  RESERVED_SLUGS: new Set(),
}));

describe('registerOrganization service', () => {
  let registerOrganization: typeof import('../routes/auth.service.js').registerOrganization;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockApp: any = {
    jwt: {
      sign: vi.fn().mockReturnValue('mock-access-token'),
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../routes/auth.service.js');
    registerOrganization = mod.registerOrganization;
  });

  it('throws 409 when email is already registered', async () => {
    mockSelectLimit.mockResolvedValueOnce([{ id: 'existing-user', email: 'dupe@test.com' }]);

    await expect(
      registerOrganization(mockApp, {
        email: 'dupe@test.com',
        password: 'Secret123',
        firstName: 'Jane',
        lastName: 'Doe',
        orgName: 'Test Org',
        timezone: 'Australia/Melbourne',
      }),
    ).rejects.toMatchObject({ message: 'Email already registered', statusCode: 409 });
  });

  it('creates org, user, and membership in a transaction', async () => {
    // No existing user, no existing slug
    mockSelectLimit.mockResolvedValueOnce([]);
    mockSelectLimit.mockResolvedValueOnce([]);

    const mockOrg = { id: 'org-1', name: 'Test Org' };
    const mockUser = { id: 'user-1', email: 'new@test.com', firstName: 'Jane', lastName: 'Doe' };
    const mockMembership = {
      id: 'mem-1',
      userId: 'user-1',
      organizationId: 'org-1',
      role: 'owner',
    };

    // Transaction executes the callback
    mockTransaction.mockImplementationOnce(async (cb: (...args: unknown[]) => unknown) => {
      const txInsertReturning = vi.fn();
      const txInsertValues = vi.fn(() => ({ returning: txInsertReturning }));
      const txInsert = vi.fn(() => ({ values: txInsertValues }));

      // 1st call: insert org
      txInsertReturning.mockResolvedValueOnce([mockOrg]);
      // 2nd call: insert user
      txInsertReturning.mockResolvedValueOnce([mockUser]);
      // 3rd call: insert membership
      txInsertReturning.mockResolvedValueOnce([mockMembership]);
      // 4th call: audit log — calls values() but not returning(), so no extra mock needed

      const tx = { insert: txInsert };
      return cb(tx);
    });

    // Mock generateTokens internal calls (refresh token insert)
    mockInsertValues.mockReturnValueOnce({ returning: vi.fn() });

    const result = await registerOrganization(mockApp, {
      email: 'new@test.com',
      password: 'Secret123',
      firstName: 'Jane',
      lastName: 'Doe',
      orgName: 'Test Org',
      timezone: 'Australia/Melbourne',
    });

    expect(result).toHaveProperty('accessToken');
    expect(result).toHaveProperty('refreshToken');
    expect(mockTransaction).toHaveBeenCalledOnce();
  });

  it('rolls back transaction on failure', async () => {
    // No existing user, no existing slug
    mockSelectLimit.mockResolvedValueOnce([]);
    mockSelectLimit.mockResolvedValueOnce([]);

    mockTransaction.mockImplementationOnce(async (cb: (...args: unknown[]) => unknown) => {
      const txInsertReturning = vi.fn().mockRejectedValueOnce(new Error('DB constraint error'));
      const txInsertValues = vi.fn(() => ({ returning: txInsertReturning }));
      const txInsert = vi.fn(() => ({ values: txInsertValues }));
      const tx = { insert: txInsert };
      return cb(tx);
    });

    await expect(
      registerOrganization(mockApp, {
        email: 'fail@test.com',
        password: 'Secret123',
        firstName: 'Jane',
        lastName: 'Doe',
        orgName: 'Fail Org',
        timezone: 'Australia/Melbourne',
      }),
    ).rejects.toThrow('DB constraint error');
  });
});
