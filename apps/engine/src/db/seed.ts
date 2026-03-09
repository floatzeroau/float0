import 'dotenv/config';
import { hash } from 'bcrypt';
import { db } from './connection.js';
import { organizations, users, orgMemberships } from './schema/core.js';

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
      permissions: {},
    })
    .returning();

  console.log(`Created membership: ${membership.id} (role: ${membership.role})`);

  console.log('Seed complete.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
