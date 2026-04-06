import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// ── Schema validation tests ───────────────────────────────

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[a-zA-Z]/, 'Password must contain at least one letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

const inviteSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(['admin', 'manager', 'staff']),
  posPin: z
    .string()
    .regex(/^\d{4,6}$/, 'PIN must be 4-6 digits')
    .optional(),
});

const setupAccountSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});

describe('inviteSchema validation', () => {
  const validInvite = {
    email: 'staff@example.com',
    firstName: 'Jane',
    lastName: 'Doe',
    role: 'staff',
  };

  it('accepts valid invite payload', () => {
    const result = inviteSchema.safeParse(validInvite);
    expect(result.success).toBe(true);
  });

  it('accepts invite with posPin', () => {
    const result = inviteSchema.safeParse({ ...validInvite, posPin: '1234' });
    expect(result.success).toBe(true);
  });

  it('accepts 6-digit posPin', () => {
    const result = inviteSchema.safeParse({ ...validInvite, posPin: '123456' });
    expect(result.success).toBe(true);
  });

  it('rejects posPin with non-digits', () => {
    const result = inviteSchema.safeParse({ ...validInvite, posPin: '12ab' });
    expect(result.success).toBe(false);
  });

  it('rejects posPin shorter than 4 digits', () => {
    const result = inviteSchema.safeParse({ ...validInvite, posPin: '123' });
    expect(result.success).toBe(false);
  });

  it('rejects posPin longer than 6 digits', () => {
    const result = inviteSchema.safeParse({ ...validInvite, posPin: '1234567' });
    expect(result.success).toBe(false);
  });

  it('rejects missing email', () => {
    const { email: _, ...rest } = validInvite;
    const result = inviteSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects invalid role', () => {
    const result = inviteSchema.safeParse({ ...validInvite, role: 'owner' });
    expect(result.success).toBe(false);
  });

  it('rejects missing firstName', () => {
    const { firstName: _, ...rest } = validInvite;
    const result = inviteSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

describe('setupAccountSchema validation', () => {
  it('accepts valid token + password', () => {
    const result = setupAccountSchema.safeParse({
      token: 'jwt.token.here',
      password: 'Secret123',
    });
    expect(result.success).toBe(true);
  });

  it('rejects weak password (no number)', () => {
    const result = setupAccountSchema.safeParse({
      token: 'jwt.token.here',
      password: 'abcdefgh',
    });
    expect(result.success).toBe(false);
  });

  it('rejects weak password (too short)', () => {
    const result = setupAccountSchema.safeParse({
      token: 'jwt.token.here',
      password: 'Ab1',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing token', () => {
    const result = setupAccountSchema.safeParse({ password: 'Secret123' });
    expect(result.success).toBe(false);
  });
});

// ── Service function tests (mocked DB) ───────────────────

const {
  mockSelectLimit,
  mockSelectFrom,
  mockSelectWhere,
  mockUpdate,
  mockUpdateReturning,
  mockInsertValues,
  mockInsert,
  mockTransaction,
  mockInnerJoinWhere,
} = vi.hoisted(() => {
  const mockSelectLimit = vi.fn();
  const mockSelectWhere = vi.fn(() => ({ limit: mockSelectLimit }));
  const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere }));
  const mockUpdateReturning = vi.fn();
  const mockUpdateWhere = vi.fn(() => ({ returning: mockUpdateReturning }));
  const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }));
  const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }));
  const mockInsertValues = vi.fn(() => ({ returning: vi.fn(), catch: vi.fn() }));
  const mockInsert = vi.fn(() => ({ values: mockInsertValues }));
  const mockTransaction = vi.fn();
  const mockInnerJoinWhere = vi.fn();
  return {
    mockSelectLimit,
    mockSelectFrom,
    mockSelectWhere,
    mockUpdate,
    mockUpdateReturning,
    mockInsertValues,
    mockInsert,
    mockTransaction,
    mockInnerJoinWhere,
  };
});

vi.mock('../db/connection.js', () => ({
  db: {
    select: () => ({ from: mockSelectFrom }),
    update: mockUpdate,
    insert: mockInsert,
    transaction: mockTransaction,
  },
}));

vi.mock('bcrypt', () => ({
  hash: vi.fn().mockResolvedValue('$2b$10$hashed'),
  compare: vi.fn().mockResolvedValue(false),
}));

vi.mock('@float0/shared', () => ({
  ROLE_HIERARCHY: { owner: 5, admin: 4, manager: 3, staff: 2, customer: 1 },
  getEffectivePermissions: vi.fn().mockReturnValue([]),
}));

vi.mock('../services/email-service.js', () => ({
  getEmailService: vi.fn().mockReturnValue({
    sendInvite: vi.fn().mockResolvedValue(true),
  }),
}));

describe('inviteUser service', () => {
  let inviteUser: typeof import('../routes/users.service.js').inviteUser;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockApp: any = {
    jwt: {
      sign: vi.fn().mockReturnValue('mock-setup-token'),
      verify: vi.fn(),
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../routes/users.service.js');
    inviteUser = mod.inviteUser;
  });

  it('throws 403 when inviting role >= own role', async () => {
    // Inviter is admin (level 4), trying to invite admin (level 4)
    mockSelectLimit.mockResolvedValueOnce([
      { id: 'mem-1', role: 'admin', userId: 'inviter-1', organizationId: 'org-1' },
    ]);

    await expect(
      inviteUser(
        mockApp,
        'org-1',
        { email: 'new@test.com', firstName: 'A', lastName: 'B', role: 'admin' },
        { orgId: 'org-1', userId: 'inviter-1' },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws 409 when user already belongs to org', async () => {
    // Inviter is admin
    mockSelectLimit.mockResolvedValueOnce([
      { id: 'mem-1', role: 'admin', userId: 'inviter-1', organizationId: 'org-1' },
    ]);
    // Existing user found
    mockSelectLimit.mockResolvedValueOnce([{ id: 'existing-user', email: 'dupe@test.com' }]);
    // Existing membership found
    mockSelectLimit.mockResolvedValueOnce([
      { id: 'mem-2', userId: 'existing-user', organizationId: 'org-1' },
    ]);

    await expect(
      inviteUser(
        mockApp,
        'org-1',
        { email: 'dupe@test.com', firstName: 'A', lastName: 'B', role: 'staff' },
        { orgId: 'org-1', userId: 'inviter-1' },
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('creates user and membership in a transaction', async () => {
    // Inviter is admin
    mockSelectLimit.mockResolvedValueOnce([
      { id: 'mem-1', role: 'admin', userId: 'inviter-1', organizationId: 'org-1' },
    ]);
    // No existing user
    mockSelectLimit.mockResolvedValueOnce([]);
    // Transaction callback
    mockTransaction.mockImplementationOnce(async (cb: (...args: unknown[]) => unknown) => {
      const txInsertReturning = vi.fn();
      const txInsertValues = vi.fn(() => ({ returning: txInsertReturning }));
      const txInsert = vi.fn(() => ({ values: txInsertValues }));

      txInsertReturning.mockResolvedValueOnce([
        { id: 'new-user', email: 'new@test.com', firstName: 'A', lastName: 'B' },
      ]);
      txInsertReturning.mockResolvedValueOnce([
        { id: 'mem-2', role: 'staff', userId: 'new-user', organizationId: 'org-1' },
      ]);

      return cb({ insert: txInsert });
    });
    // Org lookup for email
    mockSelectLimit.mockResolvedValueOnce([{ name: 'Test Org' }]);
    // Inviter lookup for email
    mockSelectLimit.mockResolvedValueOnce([{ firstName: 'Admin', lastName: 'User' }]);

    const result = await inviteUser(
      mockApp,
      'org-1',
      { email: 'new@test.com', firstName: 'A', lastName: 'B', role: 'staff' },
      { orgId: 'org-1', userId: 'inviter-1' },
    );

    expect(result).toHaveProperty('userId', 'new-user');
    expect(result).toHaveProperty('setupToken', 'mock-setup-token');
    expect(mockTransaction).toHaveBeenCalledOnce();
  });
});

describe('setupAccount service', () => {
  let setupAccount: typeof import('../routes/users.service.js').setupAccount;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockApp: any = {
    jwt: {
      sign: vi.fn(),
      verify: vi.fn(),
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../routes/users.service.js');
    setupAccount = mod.setupAccount;
  });

  it('throws 401 for invalid token', async () => {
    mockApp.jwt.verify.mockImplementation(() => {
      throw new Error('invalid');
    });

    await expect(setupAccount(mockApp, 'bad-token', 'Secret123')).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('throws 401 for wrong token purpose', async () => {
    mockApp.jwt.verify.mockReturnValue({
      userId: 'user-1',
      orgId: 'org-1',
      purpose: 'password-reset',
    });

    await expect(setupAccount(mockApp, 'valid-token', 'Secret123')).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('sets password and activates user for valid token', async () => {
    mockApp.jwt.verify.mockReturnValue({
      userId: 'user-1',
      orgId: 'org-1',
      purpose: 'account-setup',
    });
    mockSelectLimit.mockResolvedValueOnce([{ id: 'user-1', email: 'test@test.com' }]);
    // update + audit insert
    mockUpdateReturning.mockResolvedValueOnce([]);
    mockInsertValues.mockReturnValueOnce({ catch: vi.fn() });

    const result = await setupAccount(mockApp, 'valid-token', 'Secret123');
    expect(result.message).toContain('Account setup complete');
    expect(mockUpdate).toHaveBeenCalled();
  });
});

describe('deactivateUser service', () => {
  let deactivateUser: typeof import('../routes/users.service.js').deactivateUser;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../routes/users.service.js');
    deactivateUser = mod.deactivateUser;
  });

  it('throws 404 if user not in org', async () => {
    mockSelectLimit.mockResolvedValueOnce([]);

    await expect(
      deactivateUser('org-1', 'missing-user', { orgId: 'org-1', userId: 'admin-1' }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 400 when deactivating self', async () => {
    mockSelectLimit.mockResolvedValueOnce([
      { id: 'mem-1', userId: 'admin-1', role: 'admin', organizationId: 'org-1' },
    ]);

    await expect(
      deactivateUser('org-1', 'admin-1', { orgId: 'org-1', userId: 'admin-1' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 403 when deactivating owner', async () => {
    mockSelectLimit.mockResolvedValueOnce([
      { id: 'mem-1', userId: 'owner-1', role: 'owner', organizationId: 'org-1' },
    ]);

    await expect(
      deactivateUser('org-1', 'owner-1', { orgId: 'org-1', userId: 'admin-1' }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('deactivates user successfully', async () => {
    mockSelectLimit.mockResolvedValueOnce([
      { id: 'mem-1', userId: 'staff-1', role: 'staff', organizationId: 'org-1' },
    ]);
    mockUpdateReturning.mockResolvedValueOnce([]);
    mockInsertValues.mockReturnValueOnce({ catch: vi.fn() });

    const result = await deactivateUser('org-1', 'staff-1', {
      orgId: 'org-1',
      userId: 'admin-1',
    });
    expect(result.message).toBe('User deactivated');
  });
});

describe('listOrgUsers service', () => {
  let listOrgUsers: typeof import('../routes/users.service.js').listOrgUsers;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Override selectFrom to return innerJoin chain for list queries
    mockSelectFrom.mockImplementation(() => ({
      where: mockSelectWhere,
      innerJoin: vi.fn().mockReturnValue({ where: mockInnerJoinWhere }),
    }));
    const mod = await import('../routes/users.service.js');
    listOrgUsers = mod.listOrgUsers;
  });

  it('returns mapped user list', async () => {
    mockInnerJoinWhere.mockResolvedValueOnce([
      {
        id: 'user-1',
        email: 'staff@test.com',
        firstName: 'Jane',
        lastName: 'Doe',
        phone: null,
        isActive: true,
        role: 'staff',
        hasPosPin: '$2b$10$hashvalue',
        createdAt: new Date(),
      },
    ]);

    const result = await listOrgUsers('org-1');
    expect(result).toHaveLength(1);
    expect(result[0].hasPinSet).toBe(true);
    expect(result[0].email).toBe('staff@test.com');
  });

  it('returns empty array when no users', async () => {
    mockInnerJoinWhere.mockResolvedValueOnce([]);

    const result = await listOrgUsers('org-1');
    expect(result).toEqual([]);
  });
});
