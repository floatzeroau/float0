import 'dotenv/config';
import crypto from 'node:crypto';
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
  orders,
  orderItems,
  payments,
  packs,
  packTransactions,
  packServeRecords,
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

    // Ensure cafePack settings exist on existing orgs (idempotent)
    if (!org.settings || !(org.settings as any).cafePack) {
      const newSettings = {
        ...(org.settings ?? {}),
        cafePack: {
          enabled: true,
          expiryMode: 'none',
          expiryDays: null,
        },
      };
      await db
        .update(organizations)
        .set({ settings: newSettings })
        .where(eq(organizations.id, org.id));
      org = { ...org, settings: newSettings };
      console.log(`Updated existing org with cafePack settings`);
    }
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

  let ownerMembershipId: string;
  if (existingOwnerMembership) {
    await db
      .update(orgMemberships)
      .set({ pinHash: ownerPinHash, role: 'owner' })
      .where(eq(orgMemberships.id, existingOwnerMembership.id));
    ownerMembershipId = existingOwnerMembership.id;
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
    ownerMembershipId = membership.id;
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
        allowAsPack: true,
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
        allowAsPack: true,
        sortOrder: 2,
      },
      {
        organizationId: org.id,
        name: 'Croissant',
        description: 'Freshly baked butter croissant',
        categoryId: catPastry.id,
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
        categoryId: catPastry.id,
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
        categoryId: catCoffee.id,
        basePrice: 5.5,
        sku: 'IL-001',
        barcode: '9300001000073',
        isAvailable: true,
        allowAsPack: true,
        sortOrder: 3,
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

  // ── Expanded menu (new products) ────────────────────────
  const newProductRows = await db
    .insert(products)
    .values([
      // Coffees (catCoffee, allowAsPack: true)
      {
        organizationId: org.id,
        name: 'Long Black',
        categoryId: catCoffee.id,
        basePrice: 4.5,
        sku: 'LB-001',
        isAvailable: true,
        allowAsPack: true,
        sortOrder: 4,
      },
      {
        organizationId: org.id,
        name: 'Macchiato',
        categoryId: catCoffee.id,
        basePrice: 4.5,
        sku: 'MC-001',
        isAvailable: true,
        allowAsPack: true,
        sortOrder: 5,
      },
      {
        organizationId: org.id,
        name: 'Mocha',
        categoryId: catCoffee.id,
        basePrice: 5.5,
        sku: 'MO-001',
        isAvailable: true,
        allowAsPack: true,
        sortOrder: 6,
      },
      {
        organizationId: org.id,
        name: 'Piccolo',
        categoryId: catCoffee.id,
        basePrice: 4.5,
        sku: 'PI-001',
        isAvailable: true,
        allowAsPack: true,
        sortOrder: 7,
      },
      {
        organizationId: org.id,
        name: 'Cortado',
        categoryId: catCoffee.id,
        basePrice: 4.8,
        sku: 'CO-001',
        isAvailable: true,
        allowAsPack: true,
        sortOrder: 8,
      },
      {
        organizationId: org.id,
        name: 'Magic',
        categoryId: catCoffee.id,
        basePrice: 5.0,
        sku: 'MG-001',
        isAvailable: true,
        allowAsPack: true,
        sortOrder: 9,
      },
      {
        organizationId: org.id,
        name: 'Babyccino',
        description: 'Frothed milk with a sprinkle of chocolate',
        categoryId: catCoffee.id,
        basePrice: 2.5,
        sku: 'BC-001',
        isAvailable: true,
        allowAsPack: true,
        sortOrder: 10,
      },
      {
        organizationId: org.id,
        name: 'Cold Brew',
        description: 'Slow-steeped cold brew coffee',
        categoryId: catCoffee.id,
        basePrice: 6.0,
        sku: 'CB-001',
        isAvailable: true,
        allowAsPack: true,
        sortOrder: 11,
      },
      // Teas (catTea)
      {
        organizationId: org.id,
        name: 'Earl Grey',
        description: 'Bergamot-scented black tea',
        categoryId: catTea.id,
        basePrice: 4.2,
        sku: 'EG-001',
        isAvailable: true,
        sortOrder: 1,
      },
      {
        organizationId: org.id,
        name: 'Chai Latte',
        description: 'Spiced black tea with steamed milk',
        categoryId: catTea.id,
        basePrice: 5.5,
        sku: 'CL-001',
        isAvailable: true,
        sortOrder: 2,
      },
      {
        organizationId: org.id,
        name: 'Peppermint',
        description: 'Fresh peppermint herbal tea',
        categoryId: catTea.id,
        basePrice: 4.2,
        sku: 'PP-001',
        isAvailable: true,
        sortOrder: 3,
      },
      // Cold Drinks (catColdDrinks)
      {
        organizationId: org.id,
        name: 'Sparkling Water',
        description: 'Sparkling mineral water 500ml',
        categoryId: catColdDrinks.id,
        basePrice: 4.0,
        sku: 'SW-001',
        isAvailable: true,
        isGstFree: true,
        sortOrder: 3,
      },
      {
        organizationId: org.id,
        name: 'Orange Juice',
        description: 'Freshly squeezed orange juice',
        categoryId: catColdDrinks.id,
        basePrice: 5.5,
        sku: 'OJ-001',
        isAvailable: true,
        sortOrder: 4,
      },
      {
        organizationId: org.id,
        name: 'Apple Juice',
        description: 'Cold-pressed apple juice',
        categoryId: catColdDrinks.id,
        basePrice: 5.5,
        sku: 'AJ-001',
        isAvailable: true,
        sortOrder: 5,
      },
      {
        organizationId: org.id,
        name: 'Kombucha',
        description: 'House-fermented kombucha',
        categoryId: catColdDrinks.id,
        basePrice: 6.5,
        sku: 'KB-001',
        isAvailable: true,
        sortOrder: 6,
      },
      // Food (catFood)
      {
        organizationId: org.id,
        name: 'Smashed Avo',
        description: 'Smashed avocado on sourdough with feta and chilli',
        categoryId: catFood.id,
        basePrice: 16.5,
        sku: 'SA-001',
        isAvailable: true,
        sortOrder: 3,
      },
      {
        organizationId: org.id,
        name: 'Bacon & Egg Roll',
        description: 'Bacon, egg and tomato relish on a milk bun',
        categoryId: catFood.id,
        basePrice: 12.5,
        sku: 'BE-001',
        isAvailable: true,
        sortOrder: 4,
      },
      {
        organizationId: org.id,
        name: 'Granola Bowl',
        description: 'House granola with yoghurt and seasonal fruit',
        categoryId: catFood.id,
        basePrice: 14.0,
        sku: 'GB-001',
        isAvailable: true,
        sortOrder: 5,
      },
      {
        organizationId: org.id,
        name: 'Ham & Cheese Toastie',
        description: 'Toasted sourdough with leg ham and cheddar',
        categoryId: catFood.id,
        basePrice: 11.5,
        sku: 'HC-001',
        isAvailable: true,
        sortOrder: 6,
      },
      // Pastry (catPastry)
      {
        organizationId: org.id,
        name: 'Pain au Chocolat',
        description: 'Buttery pastry with dark chocolate batons',
        categoryId: catPastry.id,
        basePrice: 5.5,
        sku: 'PC-001',
        isAvailable: true,
        sortOrder: 2,
      },
      {
        organizationId: org.id,
        name: 'Almond Croissant',
        description: 'Almond cream filled croissant, toasted',
        categoryId: catPastry.id,
        basePrice: 6.0,
        sku: 'AC-001',
        isAvailable: true,
        sortOrder: 3,
      },
      {
        organizationId: org.id,
        name: 'Blueberry Muffin',
        description: 'House-baked muffin with fresh blueberries',
        categoryId: catPastry.id,
        basePrice: 5.0,
        sku: 'BM-001',
        isAvailable: true,
        sortOrder: 4,
      },
    ])
    .returning();

  const [
    pLongBlack,
    pMacchiato,
    pMocha,
    pPiccolo,
    pCortado,
    pMagic,
    pBabyccino,
    pColdBrew,
    pEarlGrey,
    pChaiLatte,
    pPeppermint,
    pSparkling,
    pOrangeJuice,
    pAppleJuice,
    pKombucha,
    pSmashedAvo,
    pBaconEgg,
    pGranola,
    pHamCheese,
    pPainChoc,
    pAlmondCroissant,
    pBlueberryMuffin,
  ] = newProductRows;

  console.log(`Created ${newProductRows.length} additional menu items`);

  // Modifier links for new products
  const newCoffees = [
    pLongBlack,
    pMacchiato,
    pMocha,
    pPiccolo,
    pCortado,
    pMagic,
    pBabyccino,
    pColdBrew,
  ];
  const newTeasForMilk = [pEarlGrey, pChaiLatte, pPeppermint];
  const newFoodsForExtras = [pSmashedAvo, pBaconEgg, pGranola, pHamCheese];

  const newLinks = [
    ...newCoffees.flatMap((product) =>
      [mgSize, mgMilk, mgExtras].map((group, idx) => ({
        organizationId: org.id,
        productId: product.id,
        modifierGroupId: group.id,
        sortOrder: idx,
      })),
    ),
    ...newTeasForMilk.map((product) => ({
      organizationId: org.id,
      productId: product.id,
      modifierGroupId: mgMilk.id,
      sortOrder: 0,
    })),
    ...newFoodsForExtras.map((product) => ({
      organizationId: org.id,
      productId: product.id,
      modifierGroupId: mgExtras.id,
      sortOrder: 0,
    })),
  ];

  await db.insert(productModifierGroups).values(newLinks);
  console.log(`Linked modifier groups to ${newLinks.length} new product-group pairs`);

  // ── Demo customers ─────────────────────────────────────
  const customerPasswordHash = await hash('password123', SALT_ROUNDS);

  const customerRows = await db
    .insert(customers)
    .values([
      {
        organizationId: org.id,
        firstName: 'John',
        lastName: 'Smith',
        email: 'john@demo.com',
        phone: '0400 100 001',
        passwordHash: customerPasswordHash,
        emailVerified: true,
        loyaltyBalance: 0,
      },
      {
        organizationId: org.id,
        firstName: 'Sarah',
        lastName: 'Chen',
        email: 'sarah@demo.com',
        phone: '0400 100 002',
        loyaltyBalance: 0,
      },
      {
        organizationId: org.id,
        firstName: 'Marcus',
        lastName: 'Black',
        email: null,
        phone: '0400 100 003',
        loyaltyBalance: 0,
      },
      {
        organizationId: org.id,
        firstName: 'Priya',
        lastName: 'Patel',
        email: 'priya@demo.com',
        phone: '0400 100 004',
        loyaltyBalance: 0,
      },
      {
        organizationId: org.id,
        firstName: 'Tom',
        lastName: "O'Connor",
        email: 'tom@demo.com',
        phone: '0400 100 005',
        passwordHash: customerPasswordHash,
        emailVerified: true,
        loyaltyBalance: 0,
      },
    ])
    .returning();

  const [cJohn, cSarah, cMarcus, cPriya] = customerRows;
  console.log(`${customerRows.length} customers created`);

  // ── Backfill 40 orders across last 7 days ─────────────
  const ordersCreated = await backfillOrders({
    orgId: org.id,
    ownerMembershipId,
    menu: [
      { product: pFlatWhite, weight: 'coffee' },
      { product: pLatte, weight: 'coffee' },
      { product: pCappuccino, weight: 'coffee' },
      { product: pIcedLatte, weight: 'coffee' },
      { product: pLongBlack, weight: 'coffee' },
      { product: pMacchiato, weight: 'coffee' },
      { product: pMocha, weight: 'coffee' },
      { product: pPiccolo, weight: 'coffee' },
      { product: pCortado, weight: 'coffee' },
      { product: pMagic, weight: 'coffee' },
      { product: pBabyccino, weight: 'coffee' },
      { product: pColdBrew, weight: 'coffee' },
      { product: pEnglishBreakfast, weight: 'tea' },
      { product: pEarlGrey, weight: 'tea' },
      { product: pChaiLatte, weight: 'tea' },
      { product: pPeppermint, weight: 'tea' },
      { product: pBottledWater, weight: 'cold' },
      { product: pSparkling, weight: 'cold' },
      { product: pOrangeJuice, weight: 'cold' },
      { product: pAppleJuice, weight: 'cold' },
      { product: pKombucha, weight: 'cold' },
      { product: pSourdough, weight: 'food' },
      { product: pSmashedAvo, weight: 'food' },
      { product: pBaconEgg, weight: 'food' },
      { product: pGranola, weight: 'food' },
      { product: pHamCheese, weight: 'food' },
      { product: pCroissant, weight: 'pastry' },
      { product: pBananaBread, weight: 'pastry' },
      { product: pPainChoc, weight: 'pastry' },
      { product: pAlmondCroissant, weight: 'pastry' },
      { product: pBlueberryMuffin, weight: 'pastry' },
    ],
    customers: {
      john: cJohn.id,
      sarah: cSarah.id,
      marcus: cMarcus.id,
      priya: cPriya.id,
    },
  });
  console.log(`${ordersCreated} orders created`);

  // ── 3 active packs for John Smith ─────────────────────
  const packsCreated = await seedPacks({
    orgId: org.id,
    customerId: cJohn.id,
    staffId: ownerMembershipId,
    flatWhite: pFlatWhite,
    latte: pLatte,
    longBlack: pLongBlack,
  });
  console.log(`${packsCreated} packs created`);

  printSummary(org.id);
  process.exit(0);
}

// ── Helpers ────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let s = seed;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function melbourneMidnight(): Date {
  const now = new Date();
  const dateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Melbourne',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const offsetParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Australia/Melbourne',
    timeZoneName: 'longOffset',
  }).formatToParts(now);
  const tzName = offsetParts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+10:00';
  const offset = tzName.replace('GMT', '').replace('UTC', '') || '+10:00';
  return new Date(`${dateStr}T00:00:00${offset}`);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

type MenuCategory = 'coffee' | 'tea' | 'cold' | 'food' | 'pastry';
type MenuEntry = { product: { id: string; name: string; basePrice: number }; weight: MenuCategory };

async function backfillOrders(opts: {
  orgId: string;
  ownerMembershipId: string;
  menu: MenuEntry[];
  customers: { john: string; sarah: string; marcus: string; priya: string };
}): Promise<number> {
  const { orgId, ownerMembershipId, menu, customers: cust } = opts;
  const rand = mulberry32(0x10beef);
  const base = melbourneMidnight();

  // 6 orders/day for days -6..-1 (36 total) + 4 orders today (4 total) = 40
  const dayPlan: Array<{ dayOffset: number; count: number }> = [
    { dayOffset: -6, count: 6 },
    { dayOffset: -5, count: 6 },
    { dayOffset: -4, count: 6 },
    { dayOffset: -3, count: 6 },
    { dayOffset: -2, count: 6 },
    { dayOffset: -1, count: 6 },
    { dayOffset: 0, count: 4 },
  ];

  const coffeeIds = new Set(menu.filter((m) => m.weight === 'coffee').map((m) => m.product.id));
  const byCategory: Record<MenuCategory, MenuEntry[]> = {
    coffee: menu.filter((m) => m.weight === 'coffee'),
    tea: menu.filter((m) => m.weight === 'tea'),
    cold: menu.filter((m) => m.weight === 'cold'),
    food: menu.filter((m) => m.weight === 'food'),
    pastry: menu.filter((m) => m.weight === 'pastry'),
  };

  function pickCategory(): MenuCategory {
    const r = rand();
    if (r < 0.6) return 'coffee';
    if (r < 0.75) return 'food';
    if (r < 0.9) return 'pastry';
    if (r < 0.95) return 'tea';
    return 'cold';
  }

  function pickMenu(): MenuEntry {
    const cat = pickCategory();
    const pool = byCategory[cat];
    return pool[Math.floor(rand() * pool.length)];
  }

  function pickItemCount(): number {
    const r = rand();
    if (r < 0.7) return 1 + Math.floor(rand() * 2); // 1 or 2
    if (r < 0.95) return 3 + Math.floor(rand() * 2); // 3 or 4
    return 5 + Math.floor(rand() * 2); // 5 or 6
  }

  function pickSlot(dayOffset: number, dayIndex: number, count: number): Date {
    // Distribute within day: 60% morning, 25% lunch, 15% afternoon
    // For 6 orders: ~4 morning, ~1 lunch, ~1 afternoon
    // For 4 orders: ~2 morning, ~1 lunch, ~1 afternoon
    let band: 'morning' | 'lunch' | 'afternoon';
    if (count === 6) {
      if (dayIndex < 4) band = 'morning';
      else if (dayIndex === 4) band = 'lunch';
      else band = 'afternoon';
    } else {
      if (dayIndex < 2) band = 'morning';
      else if (dayIndex === 2) band = 'lunch';
      else band = 'afternoon';
    }

    let hourMin: number;
    let hourMax: number;
    if (band === 'morning') {
      hourMin = 7 * 60;
      hourMax = 10 * 60 + 30;
    } else if (band === 'lunch') {
      hourMin = 12 * 60;
      hourMax = 13 * 60 + 30;
    } else {
      hourMin = 14 * 60;
      hourMax = 16 * 60;
    }
    const minutesIntoDay = hourMin + Math.floor(rand() * (hourMax - hourMin));
    return new Date(base.getTime() + dayOffset * 24 * 60 * 60 * 1000 + minutesIntoDay * 60 * 1000);
  }

  // Pre-build the 40 order slots, then assign customers and payment methods.
  type Slot = { idx: number; orderNumber: string; completedAt: Date };
  const slots: Slot[] = [];
  let n = 0;
  for (const { dayOffset, count } of dayPlan) {
    for (let i = 0; i < count; i++) {
      n++;
      slots.push({
        idx: n - 1,
        orderNumber: `ORD-${String(n).padStart(3, '0')}`,
        completedAt: pickSlot(dayOffset, i, count),
      });
    }
  }

  // Customer assignment: John 13, Sarah 9, Marcus 4, Priya 2, Tom 0; 12 walk-ins.
  // Shuffle indices deterministically using PRNG.
  const indices = slots.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const customerForSlot: (string | null)[] = new Array(slots.length).fill(null);
  const assign = (count: number, customerId: string, cursor: { i: number }) => {
    for (let k = 0; k < count; k++) {
      customerForSlot[indices[cursor.i++]] = customerId;
    }
  };
  const cursor = { i: 0 };
  assign(13, cust.john, cursor);
  assign(9, cust.sarah, cursor);
  assign(4, cust.marcus, cursor);
  assign(2, cust.priya, cursor);

  // Build orders, items, payments
  let totalInserted = 0;
  for (const slot of slots) {
    const orderId = crypto.randomUUID();
    const itemCount = pickItemCount();
    const orderType: 'takeaway' | 'dine_in' = rand() < 0.8 ? 'takeaway' : 'dine_in';

    type ItemRow = {
      productId: string;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
      modifiers: { name: string; priceAdjustment: number }[];
    };
    const items: ItemRow[] = [];
    for (let k = 0; k < itemCount; k++) {
      const entry = pickMenu();
      const quantity = 1 + (rand() < 0.15 ? 1 : 0);
      const mods: { name: string; priceAdjustment: number }[] = [];
      if (coffeeIds.has(entry.product.id)) {
        if (rand() < 0.5) mods.push({ name: 'Oat Milk', priceAdjustment: 1.0 });
        if (rand() < 0.2) mods.push({ name: 'Extra Shot', priceAdjustment: 0.8 });
      }
      const modSum = mods.reduce((s, m) => s + m.priceAdjustment, 0);
      const unitPrice = entry.product.basePrice;
      const lineTotal = round2((unitPrice + modSum) * quantity);
      items.push({
        productId: entry.product.id,
        quantity,
        unitPrice,
        lineTotal,
        modifiers: mods,
      });
    }
    const subtotal = round2(items.reduce((s, it) => s + it.lineTotal, 0));
    const gst = round2(subtotal / 11);
    const total = subtotal;
    const createdAt = new Date(
      slot.completedAt.getTime() - (3 + Math.floor(rand() * 5)) * 60 * 1000,
    );

    // Payment method: 60% card, 30% cash, 10% split
    const payRand = rand();
    const method: 'card' | 'cash' | 'split' =
      payRand < 0.6 ? 'card' : payRand < 0.9 ? 'cash' : 'split';

    await db.insert(orders).values({
      id: orderId,
      organizationId: orgId,
      orderNumber: slot.orderNumber,
      orderType,
      status: 'completed',
      customerId: customerForSlot[slot.idx],
      staffId: ownerMembershipId,
      terminalId: 'terminal-1',
      subtotal,
      gst,
      total,
      discountAmount: 0,
      createdAt,
      updatedAt: slot.completedAt,
    });

    if (items.length > 0) {
      await db.insert(orderItems).values(
        items.map((it) => ({
          organizationId: orgId,
          orderId,
          productId: it.productId,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          lineTotal: it.lineTotal,
          modifiersJson: it.modifiers.length > 0 ? it.modifiers : null,
          createdAt,
          updatedAt: slot.completedAt,
        })),
      );
    }

    if (method === 'split') {
      const cashPart = round2(total / 2);
      const cardPart = round2(total - cashPart);
      await db.insert(payments).values([
        {
          organizationId: orgId,
          orderId,
          method: 'cash',
          amount: cashPart,
          status: 'completed',
          createdAt: slot.completedAt,
          updatedAt: slot.completedAt,
        },
        {
          organizationId: orgId,
          orderId,
          method: 'card',
          amount: cardPart,
          cardType: 'visa',
          lastFour: '4242',
          status: 'completed',
          createdAt: slot.completedAt,
          updatedAt: slot.completedAt,
        },
      ]);
    } else {
      await db.insert(payments).values({
        organizationId: orgId,
        orderId,
        method,
        amount: total,
        ...(method === 'card' ? { cardType: 'visa', lastFour: '4242' } : {}),
        ...(method === 'cash'
          ? {
              tenderedAmount: round2(Math.ceil(total / 5) * 5),
              changeGiven: round2(Math.ceil(total / 5) * 5 - total),
            }
          : {}),
        status: 'completed',
        createdAt: slot.completedAt,
        updatedAt: slot.completedAt,
      });
    }

    totalInserted++;
  }

  return totalInserted;
}

async function seedPacks(opts: {
  orgId: string;
  customerId: string;
  staffId: string;
  flatWhite: { id: string; basePrice: number };
  latte: { id: string; basePrice: number };
  longBlack: { id: string; basePrice: number };
}): Promise<number> {
  const { orgId, customerId, staffId, flatWhite, latte, longBlack } = opts;
  const dayMs = 24 * 60 * 60 * 1000;
  const now = new Date();

  // Pack 1: Flat White 10-pack, purchased 4 days ago, 8 remaining (2 served)
  const pack1PurchasedAt = new Date(now.getTime() - 4 * dayMs);
  const [pack1] = await db
    .insert(packs)
    .values({
      organizationId: orgId,
      customerId,
      productId: flatWhite.id,
      productSnapshot: {
        productId: flatWhite.id,
        name: 'Flat White',
        basePrice: 4.5,
        modifiers: [],
      },
      totalQuantity: 10,
      remainingQuantity: 8,
      pricePaid: 36.0,
      unitValue: 3.6,
      status: 'active',
      purchasedAt: pack1PurchasedAt,
      createdAt: pack1PurchasedAt,
      updatedAt: pack1PurchasedAt,
    })
    .returning();

  await db.insert(packTransactions).values([
    {
      organizationId: orgId,
      packId: pack1.id,
      type: 'purchase',
      quantity: -10,
      amount: 36.0,
      staffId,
      createdAt: pack1PurchasedAt,
    },
    {
      organizationId: orgId,
      packId: pack1.id,
      type: 'serve',
      quantity: 1,
      staffId,
      createdAt: new Date(pack1PurchasedAt.getTime() + 1 * dayMs + 8 * 60 * 60 * 1000),
    },
    {
      organizationId: orgId,
      packId: pack1.id,
      type: 'serve',
      quantity: 1,
      staffId,
      createdAt: new Date(pack1PurchasedAt.getTime() + 3 * dayMs + 9 * 60 * 60 * 1000),
    },
  ]);

  await db.insert(packServeRecords).values([
    {
      organizationId: orgId,
      customerId,
      packId: pack1.id,
      productSnapshot: { productId: flatWhite.id, name: 'Flat White', basePrice: 4.5 },
      quantityServed: 1,
      servedAt: new Date(pack1PurchasedAt.getTime() + 1 * dayMs + 8 * 60 * 60 * 1000),
      baristaId: staffId,
      terminalId: 'terminal-1',
    },
    {
      organizationId: orgId,
      customerId,
      packId: pack1.id,
      productSnapshot: { productId: flatWhite.id, name: 'Flat White', basePrice: 4.5 },
      quantityServed: 1,
      servedAt: new Date(pack1PurchasedAt.getTime() + 3 * dayMs + 9 * 60 * 60 * 1000),
      baristaId: staffId,
      terminalId: 'terminal-1',
    },
  ]);

  // Pack 2: Latte 5-pack with Almond Milk baked in, purchased 2 days ago, none served
  const pack2PurchasedAt = new Date(now.getTime() - 2 * dayMs);
  const [pack2] = await db
    .insert(packs)
    .values({
      organizationId: orgId,
      customerId,
      productId: latte.id,
      productSnapshot: {
        productId: latte.id,
        name: 'Latte',
        basePrice: 4.8,
        modifiers: [{ name: 'Almond Milk', priceAdjustment: 1.0 }],
      },
      totalQuantity: 5,
      remainingQuantity: 5,
      pricePaid: 22.0,
      unitValue: 4.4,
      status: 'active',
      purchasedAt: pack2PurchasedAt,
      createdAt: pack2PurchasedAt,
      updatedAt: pack2PurchasedAt,
    })
    .returning();

  await db.insert(packTransactions).values({
    organizationId: orgId,
    packId: pack2.id,
    type: 'purchase',
    quantity: -5,
    amount: 22.0,
    staffId,
    createdAt: pack2PurchasedAt,
  });

  // Pack 3: Long Black 10-pack purchased 30 days ago, 3 remaining (7 served, two serves)
  const pack3PurchasedAt = new Date(now.getTime() - 30 * dayMs);
  const [pack3] = await db
    .insert(packs)
    .values({
      organizationId: orgId,
      customerId,
      productId: longBlack.id,
      productSnapshot: {
        productId: longBlack.id,
        name: 'Long Black',
        basePrice: 4.5,
        modifiers: [],
      },
      totalQuantity: 10,
      remainingQuantity: 3,
      pricePaid: 36.0,
      unitValue: 3.6,
      status: 'active',
      purchasedAt: pack3PurchasedAt,
      createdAt: pack3PurchasedAt,
      updatedAt: pack3PurchasedAt,
    })
    .returning();

  const pack3Serve1At = new Date(pack3PurchasedAt.getTime() + 5 * dayMs + 8 * 60 * 60 * 1000);
  const pack3Serve2At = new Date(pack3PurchasedAt.getTime() + 18 * dayMs + 9 * 60 * 60 * 1000);

  await db.insert(packTransactions).values([
    {
      organizationId: orgId,
      packId: pack3.id,
      type: 'purchase',
      quantity: -10,
      amount: 36.0,
      staffId,
      createdAt: pack3PurchasedAt,
    },
    {
      organizationId: orgId,
      packId: pack3.id,
      type: 'serve',
      quantity: 4,
      staffId,
      createdAt: pack3Serve1At,
    },
    {
      organizationId: orgId,
      packId: pack3.id,
      type: 'serve',
      quantity: 3,
      staffId,
      createdAt: pack3Serve2At,
    },
  ]);

  await db.insert(packServeRecords).values([
    {
      organizationId: orgId,
      customerId,
      packId: pack3.id,
      productSnapshot: { productId: longBlack.id, name: 'Long Black', basePrice: 4.5 },
      quantityServed: 4,
      servedAt: pack3Serve1At,
      baristaId: staffId,
      terminalId: 'terminal-1',
    },
    {
      organizationId: orgId,
      customerId,
      packId: pack3.id,
      productSnapshot: { productId: longBlack.id, name: 'Long Black', basePrice: 4.5 },
      quantityServed: 3,
      servedAt: pack3Serve2At,
      baristaId: staffId,
      terminalId: 'terminal-1',
    },
  ]);

  return 3;
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
