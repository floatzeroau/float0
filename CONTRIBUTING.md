# Contributing to Float0

## Branch Naming

All branches must follow this convention:

```
feature/FLO-XXX-description
fix/FLO-XXX-description
chore/FLO-XXX-description
```

- **feature/** — New functionality
- **fix/** — Bug fixes
- **chore/** — Maintenance, refactors, CI, docs

The `FLO-XXX` prefix links to the Linear issue.

## Development Workflow

1. Create a branch from `main` following the naming convention
2. Make your changes
3. Ensure all checks pass:
   ```bash
   pnpm turbo run lint
   pnpm turbo run build
   pnpm turbo run test
   ```
4. Open a PR against `main`
5. Get review and merge

## Pre-commit Hooks

Husky runs lint-staged on every commit:

- **TypeScript files** — ESLint autofix + Prettier
- **JSON/MD/CSS** — Prettier

## Project Structure

| Directory         | Description              |
| ----------------- | ------------------------ |
| `apps/engine`     | Fastify API (port 4000)  |
| `apps/hub`        | Admin dashboard (3000)   |
| `apps/portal`     | Customer portal (3001)   |
| `apps/pos`        | React Native POS app     |
| `packages/shared` | Shared types & utilities |
| `packages/ui`     | Shared UI components     |
| `packages/events` | Event definitions        |
