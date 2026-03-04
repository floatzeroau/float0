# Float0 POS Platform

Multi-tenant POS platform for Australian cafes.

## Directory Structure

```
float0/
├── apps/
│   ├── engine/       # Node.js API
│   ├── pos/          # React Native POS app
│   ├── hub/          # Next.js hub dashboard
│   └── portal/       # Next.js customer portal
├── packages/
│   ├── shared/       # Shared types & utilities
│   ├── ui/           # Shared UI components
│   └── events/       # Event definitions
├── turbo.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## Setup

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Start development
pnpm dev
```

## Scripts

| Command      | Description                |
| ------------ | -------------------------- |
| `pnpm build` | Build all apps & packages  |
| `pnpm dev`   | Start all apps in dev mode |
| `pnpm lint`  | Lint all apps & packages   |
| `pnpm test`  | Run all tests              |
