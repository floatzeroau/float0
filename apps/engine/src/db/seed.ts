import 'dotenv/config';
import { hash } from 'bcrypt';
import { eq, and } from 'drizzle-orm';
import { db } from './connection.js';
import { organizations, users, orgMemberships } from './schema/core.js';
import {
  categories,
  products,
  modifierGroups,
  modifiers,
  productModifierGroups,
  customers,
} from './schema/pos.js';

const SALT_ROUNDS = 10;

async function seed() {
  console.log('Seeding database...');

  // ── Organization (find or create) ─────────────────────
  const ORG_EMAIL = 'hello@float0demo.com.au';

  let org: typeof organizations.$inferSelect;
  const [existingOrg] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.email, ORG_EMAIL))
    .limit(1);

  if (existingOrg) {
    org = existingOrg;
    console.log(`Organization already exists: ${org.name} (${org.id})`);
  } else {
    const [created] = await db
      .insert(organizations)
      .values({
        name: 'Float0 Demo Cafe',
        slug: 'float0-demo-cafe',
        abn: '12345678901',
        address: '123 Collins St, Melbourne VIC 3000',
        phone: '+61 3 9000 0000',
        email: ORG_EMAIL,
        timezone: 'Australia/Melbourne',
        currency: 'AUD',
        enabledModules: ['pos', 'inventory', 'loyalty'],
        subscriptionTier: 'professional',
        settings: {
          receipt: {
            footerText: 'Thank you for visiting Float0 Demo Cafe!',
            socialMedia: '@float0cafe',
          },
          cafePack: {
            enabled: true,
            expiryMode: 'none',
            expiryDays: null,
          },
        },
      })
      .returning();
    org = created;
    console.log(`Created organization: ${org.name} (${org.id})`);
  }

  // ── Owner user ──────────────────────────────────────────
  const ownerPasswordHash = await hash('password123', SALT_ROUNDS);
  const ownerPinHash = await hash('1234', SALT_ROUNDS);

  const [ownerUser] = await db
    .insert(users)
    .values({
      email: 'owner@demo.float0.com',
      passwordHash: ownerPasswordHash,
      firstName: 'Demo',
      lastName: 'Owner',
      phone: '+61 400 000 000',
      isActive: true,
    })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        firstName: 'Demo',
        lastName: 'Owner',
        passwordHash: ownerPasswordHash,
        isActive: true,
      },
    })
    .returning();

  console.log(`Upserted owner: ${ownerUser.email} (${ownerUser.id})`);

  // Owner membership
  const [existingOwnerMembership] = await db
    .select()
    .from(orgMemberships)
    .where(and(eq(orgMemberships.userId, ownerUser.id), eq(orgMemberships.organizationId, org.id)))
    .limit(1);

  if (existingOwnerMembership) {
    await db
      .update(orgMemberships)
      .set({ pinHash: ownerPinHash, role: 'owner' })
      .where(eq(orgMemberships.id, existingOwnerMembership.id));
    console.log(`Updated owner membership: ${existingOwnerMembership.id}`);
  } else {
    const [membership] = await db
      .insert(orgMemberships)
      .values({
        userId: ownerUser.id,
        organizationId: org.id,
        role: 'owner',
        pinHash: ownerPinHash,
        permissions: [],
      })
      .returning();
    console.log(`Created owner membership: ${membership.id} (role: ${membership.role})`);
  }

  // ── Staff user ──────────────────────────────────────────
  const staffPasswordHash = await hash('password123', SALT_ROUNDS);
  const staffPinHash = await hash('5678', SALT_ROUNDS);

  const [staffUser] = await db
    .insert(users)
    .values({
      email: 'staff@demo.float0.com',
      passwordHash: staffPasswordHash,
      firstName: 'Demo',
      lastName: 'Staff',
      phone: '+61 400 000 001',
      isActive: true,
    })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        firstName: 'Demo',
        lastName: 'Staff',
        passwordHash: staffPasswordHash,
        isActive: true,
      },
    })
    .returning();

  console.log(`Upserted staff: ${staffUser.email} (${staffUser.id})`);

  // Staff membership
  const [existingStaffMembership] = await db
    .select()
    .from(orgMemberships)
    .where(and(eq(orgMemberships.userId, staffUser.id), eq(orgMemberships.organizationId, org.id)))
    .limit(1);

  if (existingStaffMembership) {
    await db
      .update(orgMemberships)
      .set({ pinHash: staffPinHash, role: 'staff' })
      .where(eq(orgMemberships.id, existingStaffMembership.id));
    console.log(`Updated staff membership: ${existingStaffMembership.id}`);
  } else {
    const [membership] = await db
      .insert(orgMemberships)
      .values({
        userId: staffUser.id,
        organizationId: org.id,
        role: 'staff',
        pinHash: staffPinHash,
        permissions: [],
      })
      .returning();
    console.log(`Created staff membership: ${membership.id} (role: ${membership.role})`);
  }

  // ── POS Seed Data (skip if already seeded) ─────────────
  const existingCategories = await db
    .select()
    .from(categories)
    .where(eq(categories.organizationId, org.id))
    .limit(1);

  if (existingCategories.length > 0) {
    console.log('POS data already seeded, skipping...');
    printSummary(org.id);
    process.exit(0);
  }

  const [catCoffee, catTea, catColdDrinks, catSpecialty, catFood, catPastry] = await db
    .insert(categories)
    .values([
      { organizationId: org.id, name: 'Coffee', colour: '#6F4E37', icon: 'coffee', sortOrder: 0 },
      { organizationId: org.id, name: 'Tea', colour: '#2E8B57', icon: 'leaf', sortOrder: 1 },
      {
        organizationId: org.id,
        name: 'Cold Drinks',
        colour: '#4682B4',
        icon: 'glass-water',
        sortOrder: 2,
      },
      { organizationId: org.id, name: 'Specialty', colour: '#9B59B6', icon: 'star', sortOrder: 3 },
      { organizationId: org.id, name: 'Food', colour: '#D97706', icon: 'utensils', sortOrder: 4 },
      {
        organizationId: org.id,
        name: 'Pastry',
        colour: '#DC2626',
        icon: 'cake-slice',
        sortOrder: 5,
      },
    ])
    .returning();

  console.log(
    `Created categories: ${[catCoffee, catTea, catColdDrinks, catSpecialty, catFood, catPastry].map((c) => c.name).join(', ')}`,
  );

  const [
    pFlatWhite,
    pLatte,
    pCappuccino,
    pCroissant,
    pBananaBread,
    pEnglishBreakfast,
    pIcedLatte,
    pSourdough,
    pPlainMilk,
    pBottledWater,
  ] = await db
    .insert(products)
    .values([
      {
        organizationId: org.id,
        name: 'Flat White',
        categoryId: catCoffee.id,
        basePrice: 4.5,
        sku: 'FW-001',
        barcode: '9300001000011',
        isAvailable: true,
        allowAsPack: true,
        sortOrder: 0,
      },
      {
        organizationId: org.id,
        name: 'Latte',
        categoryId: catCoffee.id,
        basePrice: 4.5,
        sku: 'LT-001',
        barcode: '9300001000028',
        isAvailable: true,
        sortOrder: 1,
      },
      {
        organizationId: org.id,
        name: 'Cappuccino',
        categoryId: catCoffee.id,
        basePrice: 4.5,
        sku: 'CP-001',
        barcode: '9300001000035',
        isAvailable: true,
        sortOrder: 2,
      },
      {
        organizationId: org.id,
        name: 'Croissant',
        description: 'Freshly baked butter croissant',
        categoryId: catFood.id,
        basePrice: 5.0,
        sku: 'CR-001',
        barcode: '9300001000042',
        isAvailable: true,
        sortOrder: 0,
      },
      {
        organizationId: org.id,
        name: 'Banana Bread',
        description: 'Warm banana bread with butter',
        categoryId: catFood.id,
        basePrice: 6.0,
        sku: 'BB-001',
        barcode: '9300001000059',
        isAvailable: true,
        sortOrder: 1,
      },
      {
        organizationId: org.id,
        name: 'English Breakfast',
        description: 'Classic black tea',
        categoryId: catTea.id,
        basePrice: 4.0,
        sku: 'EB-001',
        barcode: '9300001000066',
        isAvailable: true,
        sortOrder: 0,
      },
      {
        organizationId: org.id,
        name: 'Iced Latte',
        description: 'Espresso over ice with milk',
        categoryId: catColdDrinks.id,
        basePrice: 5.5,
        sku: 'IL-001',
        barcode: '9300001000073',
        isAvailable: true,
        sortOrder: 0,
      },
      {
        organizationId: org.id,
        name: 'Sourdough Toast',
        description: 'Thick-cut sourdough with butter and jam',
        categoryId: catFood.id,
        basePrice: 7.0,
        sku: 'ST-001',
        barcode: '9300001000080',
        isAvailable: true,
        sortOrder: 2,
      },
      {
        organizationId: org.id,
        name: 'Plain Milk',
        description: 'Fresh full cream milk 250ml',
        categoryId: catColdDrinks.id,
        basePrice: 2.0,
        sku: 'PM-001',
        barcode: '9300001000097',
        isAvailable: true,
        isGstFree: true,
        sortOrder: 1,
      },
      {
        organizationId: org.id,
        name: 'Bottled Water',
        description: 'Still spring water 600ml',
        categoryId: catColdDrinks.id,
        basePrice: 3.5,
        sku: 'BW-001',
        barcode: '9300001000103',
        isAvailable: true,
        isGstFree: true,
        sortOrder: 2,
      },
    ])
    .returning();

  console.log(
    `Created products: ${[pFlatWhite, pLatte, pCappuccino, pCroissant, pBananaBread, pEnglishBreakfast, pIcedLatte, pSourdough, pPlainMilk, pBottledWater].map((p) => p.name).join(', ')}`,
  );

  const [mgSize, mgMilk, mgExtras] = await db
    .insert(modifierGroups)
    .values([
      {
        organizationId: org.id,
        name: 'Size',
        displayName: 'Choose size',
        selectionType: 'single',
        minSelections: 1,
        maxSelections: 1,
        sortOrder: 0,
      },
      {
        organizationId: org.id,
        name: 'Milk',
        displayName: 'Choose your milk',
        selectionType: 'single',
        minSelections: 0,
        maxSelections: 1,
        sortOrder: 1,
      },
      {
        organizationId: org.id,
        name: 'Extras',
        displayName: 'Add extras',
        selectionType: 'multiple',
        minSelections: 0,
        maxSelections: 3,
        sortOrder: 2,
      },
    ])
    .returning();

  console.log(
    `Created modifier groups: ${[mgSize, mgMilk, mgExtras].map((g) => g.name).join(', ')}`,
  );

  await db.insert(modifiers).values([
    // Size modifiers
    {
      organizationId: org.id,
      name: 'Small',
      modifierGroupId: mgSize.id,
      priceAdjustment: 0,
      isDefault: false,
      isAvailable: true,
      sortOrder: 0,
    },
    {
      organizationId: org.id,
      name: 'Regular',
      modifierGroupId: mgSize.id,
      priceAdjustment: 0.5,
      isDefault: true,
      isAvailable: true,
      sortOrder: 1,
    },
    {
      organizationId: org.id,
      name: 'Large',
      modifierGroupId: mgSize.id,
      priceAdjustment: 1.0,
      isDefault: false,
      isAvailable: true,
      sortOrder: 2,
    },
    // Milk modifiers
    {
      organizationId: org.id,
      name: 'Full Cream',
      modifierGroupId: mgMilk.id,
      priceAdjustment: 0,
      isDefault: true,
      isAvailable: true,
      sortOrder: 0,
    },
    {
      organizationId: org.id,
      name: 'Oat Milk',
      modifierGroupId: mgMilk.id,
      priceAdjustment: 0.7,
      isDefault: false,
      isAvailable: true,
      sortOrder: 1,
    },
    {
      organizationId: org.id,
      name: 'Soy',
      modifierGroupId: mgMilk.id,
      priceAdjustment: 0.5,
      isDefault: false,
      isAvailable: true,
      sortOrder: 2,
    },
    // Extras modifiers
    {
      organizationId: org.id,
      name: 'Extra Shot',
      modifierGroupId: mgExtras.id,
      priceAdjustment: 0.5,
      isDefault: false,
      isAvailable: true,
      sortOrder: 0,
    },
    {
      organizationId: org.id,
      name: 'Keep Cup',
      modifierGroupId: mgExtras.id,
      priceAdjustment: -0.3,
      isDefault: false,
      isAvailable: true,
      sortOrder: 1,
    },
    {
      organizationId: org.id,
      name: 'Vanilla Syrup',
      modifierGroupId: mgExtras.id,
      priceAdjustment: 0.5,
      isDefault: false,
      isAvailable: true,
      sortOrder: 2,
    },
  ]);

  console.log('Created modifiers for Size, Milk, Extras (with Keep Cup)');

  // Link modifier groups to coffee products
  const coffeeProducts = [pFlatWhite, pLatte, pCappuccino];
  const coffeeGroups = [mgSize, mgMilk, mgExtras];
  const linkValues = coffeeProducts.flatMap((product) =>
    coffeeGroups.map((group, idx) => ({
      organizationId: org.id,
      productId: product.id,
      modifierGroupId: group.id,
      sortOrder: idx,
    })),
  );

  await db.insert(productModifierGroups).values(linkValues);

  console.log('Linked Size, Milk, Extras to coffee products');

  await db.insert(customers).values([
    {
      organizationId: org.id,
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane@example.com',
      phone: '+61 400 111 111',
      loyaltyBalance: 25.0,
    },
    {
      organizationId: org.id,
      firstName: 'Bob',
      lastName: 'Jones',
      email: 'bob@example.com',
      phone: '+61 400 222 222',
      loyaltyBalance: 10.0,
    },
  ]);

  console.log('Created customers: Jane Smith, Bob Jones');

  printSummary(org.id);
  process.exit(0);
}

function printSummary(orgId: string) {
  console.log('\n════════════════════════════════════════════════════════');
  console.log('  Seed complete!');
  console.log('════════════════════════════════════════════════════════');
  console.log('');
  console.log('  Organization ID: ' + orgId);
  console.log('');
  console.log('  Hub login (owner):');
  console.log('    Email:    owner@demo.float0.com');
  console.log('    Password: password123');
  console.log('    POS PIN:  1234');
  console.log('');
  console.log('  Hub login (staff):');
  console.log('    Email:    staff@demo.float0.com');
  console.log('    Password: password123');
  console.log('    POS PIN:  5678');
  console.log('');
  console.log('  POS setup:');
  console.log(`    Set EXPO_PUBLIC_ORG_ID=${orgId} in apps/pos/.env`);
  console.log('════════════════════════════════════════════════════════\n');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
