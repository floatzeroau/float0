# Float0 POS Platform

Multi-tenant POS platform for Australian cafes.

## Directory Structure

```
float0/
├── apps/
│   ├── engine/       # Node.js API (Fastify, port 4000)
│   ├── pos/          # React Native POS app (Expo)
│   ├── hub/          # Next.js admin dashboard (port 3000)
│   └── portal/       # Next.js customer portal (port 3001)
├── packages/
│   ├── shared/       # Shared types & utilities
│   ├── ui/           # Shared UI components
│   └── events/       # Event definitions
├── turbo.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v20+
- [pnpm](https://pnpm.io/) v10+
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for PostgreSQL)
- [Xcode](https://developer.apple.com/xcode/) (for POS iPad simulator)

### Setup

```bash
# 1. Clone the repo
git clone https://github.com/floatzeroau/float0.git
cd float0

# 2. Install dependencies
pnpm install

# 3. Copy environment files
cp apps/engine/.env.example apps/engine/.env
cp apps/hub/.env.example apps/hub/.env
cp apps/portal/.env.example apps/portal/.env
cp apps/pos/.env.example apps/pos/.env

# 4. Start PostgreSQL
docker compose up -d

# 5. Run database migrations
pnpm turbo run db:migrate --filter=@float0/engine

# 6. Seed test data (creates demo org, admin user with PIN 1234, sample products)
pnpm turbo run db:seed --filter=@float0/engine

# 7. Update apps/pos/.env with the org ID printed by the seed script
#    e.g. EXPO_PUBLIC_ORG_ID=<org-id-from-seed-output>

# 8. Build the POS development client for iPad simulator (first time only)
cd apps/pos && npx expo run:ios && cd ../..

# 9. Start all apps in dev mode
pnpm dev:all
```

### POS App Login

On the iPad simulator, enter PIN **1234** to log in as the demo admin user.
The app will perform an initial data sync on first login, then show the POS screen.

## Scripts

| Command        | Description                                   |
| -------------- | --------------------------------------------- |
| `pnpm build`   | Build all apps & packages                     |
| `pnpm dev`     | Start web apps + engine in dev mode           |
| `pnpm dev:all` | Start everything including POS iPad simulator |
| `pnpm lint`    | Lint all apps & packages                      |
| `pnpm test`    | Run all tests                                 |
| `pnpm format`  | Format all files                              |
