import 'dotenv/config';
import { hash } from 'bcrypt';
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

  const [org] = await db
    .insert(organizations)
    .values({
      name: 'Float0 Demo Cafe',
      abn: '12345678901',
      address: '123 Collins St, Melbourne VIC 3000',
      phone: '+61 3 9000 0000',
      email: 'hello@float0demo.com.au',
      timezone: 'Australia/Melbourne',
      currency: 'AUD',
      enabledModules: ['pos', 'inventory', 'loyalty'],
      subscriptionTier: 'professional',
      settings: {},
    })
    .returning();

  console.log(`Created organization: ${org.name} (${org.id})`);

  const passwordHash = await hash('admin123', SALT_ROUNDS);
  const pinHash = await hash('1234', SALT_ROUNDS);

  const [user] = await db
    .insert(users)
    .values({
      email: 'admin@float0.com',
      passwordHash,
      firstName: 'Admin',
      lastName: 'User',
      phone: '+61 400 000 000',
      isActive: true,
    })
    .returning();

  console.log(`Created user: ${user.email} (${user.id})`);

  const [membership] = await db
    .insert(orgMemberships)
    .values({
      userId: user.id,
      organizationId: org.id,
      role: 'owner',
      pinHash,
      permissions: [],
    })
    .returning();

  console.log(`Created membership: ${membership.id} (role: ${membership.role})`);

  // ── POS Seed Data ────────────────────────────────────

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

  const [pFlatWhite, pLatte, pCappuccino, pCroissant, pBananaBread] = await db
    .insert(products)
    .values([
      {
        organizationId: org.id,
        name: 'Flat White',
        categoryId: catCoffee.id,
        basePrice: 4.5,
        isAvailable: true,
        sortOrder: 0,
      },
      {
        organizationId: org.id,
        name: 'Latte',
        categoryId: catCoffee.id,
        basePrice: 4.5,
        isAvailable: true,
        sortOrder: 1,
      },
      {
        organizationId: org.id,
        name: 'Cappuccino',
        categoryId: catCoffee.id,
        basePrice: 4.5,
        isAvailable: true,
        sortOrder: 2,
      },
      {
        organizationId: org.id,
        name: 'Croissant',
        description: 'Freshly baked butter croissant',
        categoryId: catFood.id,
        basePrice: 5.0,
        isAvailable: true,
        sortOrder: 0,
      },
      {
        organizationId: org.id,
        name: 'Banana Bread',
        description: 'Warm banana bread with butter',
        categoryId: catFood.id,
        basePrice: 6.0,
        isAvailable: true,
        sortOrder: 1,
      },
    ])
    .returning();

  console.log(
    `Created products: ${[pFlatWhite, pLatte, pCappuccino, pCroissant, pBananaBread].map((p) => p.name).join(', ')}`,
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
      priceAdjustment: -0.5,
      isDefault: false,
      isAvailable: true,
      sortOrder: 0,
    },
    {
      organizationId: org.id,
      name: 'Regular',
      modifierGroupId: mgSize.id,
      priceAdjustment: 0,
      isDefault: true,
      isAvailable: true,
      sortOrder: 1,
    },
    {
      organizationId: org.id,
      name: 'Large',
      modifierGroupId: mgSize.id,
      priceAdjustment: 0.5,
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
      name: 'Oat',
      modifierGroupId: mgMilk.id,
      priceAdjustment: 0.5,
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
      name: 'Vanilla Syrup',
      modifierGroupId: mgExtras.id,
      priceAdjustment: 0.5,
      isDefault: false,
      isAvailable: true,
      sortOrder: 1,
    },
    {
      organizationId: org.id,
      name: 'Whipped Cream',
      modifierGroupId: mgExtras.id,
      priceAdjustment: 1.0,
      isDefault: false,
      isAvailable: true,
      sortOrder: 2,
    },
  ]);

  console.log('Created modifiers for Size, Milk, Extras');

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

  console.log('Seed complete.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
