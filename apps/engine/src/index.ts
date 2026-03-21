import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { errorHandler } from './middleware/error-handler.js';
import { authPlugin } from './middleware/auth.js';
import { orgContextPlugin } from './middleware/org-context.js';
import { authRoutes } from './routes/auth.routes.js';
import { syncRoutes } from './routes/sync.routes.js';
import { categoryRoutes } from './routes/categories.routes.js';
import { modifierGroupRoutes } from './routes/modifier-groups.routes.js';
import { modifierRoutes } from './routes/modifiers.routes.js';
import { productRoutes } from './routes/products.routes.js';
import { receiptRoutes } from './routes/receipts.routes.js';
import { requireAuth } from './middleware/require-auth.js';
import { requireRole } from './middleware/rbac.js';
import { registerEventLogger } from './services/event-logger.js';

const port = Number(process.env.PORT) || 4000;
const host = process.env.HOST ?? '0.0.0.0';
const corsOrigins = process.env.CORS_ORIGINS?.split(',') ?? [];

const app = Fastify({
  logger: {
    transport:
      process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss Z' } }
        : undefined,
  },
});

app.setErrorHandler(errorHandler);

await app.register(cors, { origin: corsOrigins });
await app.register(authPlugin);
await app.register(orgContextPlugin);
await app.register(authRoutes);
await app.register(syncRoutes);
await app.register(categoryRoutes);
await app.register(modifierGroupRoutes);
await app.register(modifierRoutes);
await app.register(productRoutes);
await app.register(receiptRoutes);

registerEventLogger();

app.get('/health', async () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
}));

app.get('/admin/users', { preHandler: [requireAuth, requireRole('admin')] }, async (request) => ({
  message: 'Admin access granted',
  userId: request.user.userId,
  role: request.user.role,
}));

try {
  await app.listen({ port, host });
} catch (err) {
  app.log.fatal(err);
  process.exit(1);
}
