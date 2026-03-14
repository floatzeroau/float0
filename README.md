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

# 4. Start PostgreSQL
docker-compose up -d

# 5. Run database migrations
pnpm turbo run db:migrate --filter=@float0/engine

# 6. Seed test data
pnpm turbo run db:seed --filter=@float0/engine

# 7. Start all apps in dev mode
pnpm turbo run dev
```

## Scripts

| Command       | Description                |
| ------------- | -------------------------- |
| `pnpm build`  | Build all apps & packages  |
| `pnpm dev`    | Start all apps in dev mode |
| `pnpm lint`   | Lint all apps & packages   |
| `pnpm test`   | Run all tests              |
| `pnpm format` | Format all files           |
