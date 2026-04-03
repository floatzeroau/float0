import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { deepMerge } from '../routes/organizations.service.js';

// ── Schema validation tests ───────────────────────────────

const abnSchema = z
  .string()
  .regex(/^\d{11}$/, 'ABN must be exactly 11 digits')
  .nullable()
  .optional();

const addressSchema = z
  .object({
    street: z.string().optional(),
    suburb: z.string().optional(),
    state: z.string().optional(),
    postcode: z.string().optional(),
  })
  .nullable()
  .optional();

const IANA_TZ_RE = /^[A-Za-z_]+\/[A-Za-z_/]+$/;

const updateOrgSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  abn: abnSchema,
  address: addressSchema,
  phone: z.string().max(50).nullable().optional(),
  email: z.string().email().nullable().optional(),
  website: z.string().max(255).nullable().optional(),
  timezone: z
    .string()
    .regex(IANA_TZ_RE, 'Must be a valid IANA timezone (e.g. Australia/Melbourne)')
    .optional(),
  settings: z.record(z.unknown()).optional(),
});

const receiptSettingsSchema = z
  .object({
    headerText: z.string().optional(),
    footerText: z.string().optional(),
    socialMedia: z.string().optional(),
  })
  .optional();

const posSettingsSchema = z
  .object({
    defaultOrderType: z.string().optional(),
    tippingEnabled: z.boolean().optional(),
    tipPercentages: z.array(z.number()).optional(),
    cashRoundingEnabled: z.boolean().optional(),
    orderNumberPrefix: z.string().optional(),
  })
  .optional();

const patchSettingsSchema = z.object({
  onboarding_status: z.string().optional(),
  receipt: receiptSettingsSchema,
  pos: posSettingsSchema,
});

describe('updateOrgSchema validation', () => {
  it('accepts a valid full update', () => {
    const result = updateOrgSchema.safeParse({
      name: 'My Cafe',
      abn: '12345678901',
      address: { street: '1 Main St', suburb: 'Melbourne', state: 'VIC', postcode: '3000' },
      phone: '+61400000000',
      email: 'cafe@example.com',
      website: 'https://mycafe.com',
      timezone: 'Australia/Melbourne',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a partial update', () => {
    const result = updateOrgSchema.safeParse({ name: 'Updated Name' });
    expect(result.success).toBe(true);
  });

  it('accepts empty body', () => {
    const result = updateOrgSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = updateOrgSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid ABN (not 11 digits)', () => {
    const result = updateOrgSchema.safeParse({ abn: '1234' });
    expect(result.success).toBe(false);
  });

  it('accepts null ABN (to clear it)', () => {
    const result = updateOrgSchema.safeParse({ abn: null });
    expect(result.success).toBe(true);
  });

  it('rejects invalid timezone format', () => {
    const result = updateOrgSchema.safeParse({ timezone: 'Not a timezone' });
    expect(result.success).toBe(false);
  });

  it('accepts valid IANA timezone', () => {
    const result = updateOrgSchema.safeParse({ timezone: 'Australia/Sydney' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = updateOrgSchema.safeParse({ email: 'not-email' });
    expect(result.success).toBe(false);
  });

  it('accepts null address (to clear it)', () => {
    const result = updateOrgSchema.safeParse({ address: null });
    expect(result.success).toBe(true);
  });
});

describe('patchSettingsSchema validation', () => {
  it('accepts onboarding_status update', () => {
    const result = patchSettingsSchema.safeParse({ onboarding_status: 'completed' });
    expect(result.success).toBe(true);
  });

  it('accepts receipt settings', () => {
    const result = patchSettingsSchema.safeParse({
      receipt: { headerText: 'Welcome!', footerText: 'Thanks for visiting' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts pos settings', () => {
    const result = patchSettingsSchema.safeParse({
      pos: {
        defaultOrderType: 'dine_in',
        tippingEnabled: true,
        tipPercentages: [10, 15, 20],
        cashRoundingEnabled: false,
        orderNumberPrefix: 'ORD',
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts partial pos settings', () => {
    const result = patchSettingsSchema.safeParse({
      pos: { tippingEnabled: true },
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid tipPercentages type', () => {
    const result = patchSettingsSchema.safeParse({
      pos: { tipPercentages: 'not an array' },
    });
    expect(result.success).toBe(false);
  });
});

// ── deepMerge tests ───────────────────────────────────────

describe('deepMerge', () => {
  it('merges top-level keys', () => {
    const result = deepMerge({ a: 1, b: 2 }, { b: 3, c: 4 });
    expect(result).toEqual({ a: 1, b: 3, c: 4 });
  });

  it('deep-merges nested objects', () => {
    const result = deepMerge(
      { receipt: { headerText: 'Hello', footerText: 'Bye' } },
      { receipt: { headerText: 'Updated' } },
    );
    expect(result).toEqual({
      receipt: { headerText: 'Updated', footerText: 'Bye' },
    });
  });

  it('overwrites arrays (no array merge)', () => {
    const result = deepMerge(
      { pos: { tipPercentages: [10, 15] } },
      { pos: { tipPercentages: [5, 10, 20] } },
    );
    expect(result).toEqual({ pos: { tipPercentages: [5, 10, 20] } });
  });

  it('preserves existing keys not in source', () => {
    const result = deepMerge(
      { onboarding_status: 'pending', receipt: { headerText: 'Hi' } },
      { receipt: { footerText: 'Thanks' } },
    );
    expect(result).toEqual({
      onboarding_status: 'pending',
      receipt: { headerText: 'Hi', footerText: 'Thanks' },
    });
  });

  it('returns copy, does not mutate target', () => {
    const target = { a: 1 };
    const result = deepMerge(target, { b: 2 });
    expect(result).toEqual({ a: 1, b: 2 });
    expect(target).toEqual({ a: 1 });
  });
});

// ── Service function tests (mocked DB) ───────────────────

const {
  mockSelectLimit,
  mockSelectFrom,
  mockUpdate,
  mockUpdateReturning,
  mockInsertValues,
  mockInsert,
} = vi.hoisted(() => {
  const mockSelectLimit = vi.fn();
  const mockSelectWhere = vi.fn(() => ({ limit: mockSelectLimit }));
  const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere }));
  const mockUpdateReturning = vi.fn();
  const mockUpdateWhere = vi.fn(() => ({ returning: mockUpdateReturning }));
  const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }));
  const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }));
  const mockInsertValues = vi.fn();
  const mockInsert = vi.fn(() => ({ values: mockInsertValues }));
  return {
    mockSelectLimit,
    mockSelectFrom,
    mockUpdate,
    mockUpdateReturning,
    mockInsertValues,
    mockInsert,
  };
});

vi.mock('../db/connection.js', () => ({
  db: {
    select: () => ({ from: mockSelectFrom }),
    update: mockUpdate,
    insert: mockInsert,
  },
}));

describe('getOrganization service', () => {
  let getOrganization: typeof import('../routes/organizations.service.js').getOrganization;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../routes/organizations.service.js');
    getOrganization = mod.getOrganization;
  });

  it('returns the organization for a valid orgId', async () => {
    const mockOrg = {
      id: 'org-1',
      name: 'Test Cafe',
      settings: { onboarding_status: 'pending' },
    };
    mockSelectLimit.mockResolvedValueOnce([mockOrg]);

    const result = await getOrganization('org-1');
    expect(result).toEqual(mockOrg);
  });

  it('returns null when org not found', async () => {
    mockSelectLimit.mockResolvedValueOnce([]);

    const result = await getOrganization('missing-id');
    expect(result).toBeNull();
  });
});

describe('updateOrganization service', () => {
  let updateOrganization: typeof import('../routes/organizations.service.js').updateOrganization;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../routes/organizations.service.js');
    updateOrganization = mod.updateOrganization;
  });

  it('updates and returns the organization', async () => {
    const existing = { id: 'org-1', name: 'Old Name', settings: {} };
    const updated = { id: 'org-1', name: 'New Name', settings: {} };
    mockSelectLimit.mockResolvedValueOnce([existing]);
    mockUpdateReturning.mockResolvedValueOnce([updated]);
    mockInsertValues.mockReturnValueOnce({ catch: vi.fn() });

    const result = await updateOrganization(
      'org-1',
      { name: 'New Name' },
      { orgId: 'org-1', userId: 'user-1', ip: '127.0.0.1' },
    );
    expect(result).toEqual(updated);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it('throws 404 if org not found', async () => {
    mockSelectLimit.mockResolvedValueOnce([]);

    await expect(
      updateOrganization('missing', { name: 'X' }, { orgId: 'missing', userId: 'user-1' }),
    ).rejects.toMatchObject({ message: 'Organization not found', statusCode: 404 });
  });
});

describe('mergeOrganizationSettings service', () => {
  let mergeOrganizationSettings: typeof import('../routes/organizations.service.js').mergeOrganizationSettings;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../routes/organizations.service.js');
    mergeOrganizationSettings = mod.mergeOrganizationSettings;
  });

  it('deep-merges partial settings into existing', async () => {
    const existing = {
      id: 'org-1',
      settings: { onboarding_status: 'pending', receipt: { headerText: 'Hello' } },
    };
    const merged = {
      onboarding_status: 'pending',
      receipt: { headerText: 'Hello', footerText: 'Thanks' },
    };

    mockSelectLimit.mockResolvedValueOnce([existing]);
    mockUpdateReturning.mockResolvedValueOnce([{ settings: merged }]);
    mockInsertValues.mockReturnValueOnce({ catch: vi.fn() });

    const result = await mergeOrganizationSettings(
      'org-1',
      { receipt: { footerText: 'Thanks' } },
      { orgId: 'org-1', userId: 'user-1' },
    );
    expect(result).toEqual(merged);
  });

  it('throws 404 if org not found', async () => {
    mockSelectLimit.mockResolvedValueOnce([]);

    await expect(
      mergeOrganizationSettings(
        'missing',
        { onboarding_status: 'done' },
        { orgId: 'missing', userId: 'user-1' },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
