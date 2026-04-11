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
import { organizationRoutes } from './routes/organizations.routes.js';
import { userRoutes } from './routes/users.routes.js';
import { dashboardRoutes } from './routes/dashboard.routes.js';
import { terminalRoutes } from './routes/terminals.routes.js';
import { activityRoutes } from './routes/activity.routes.js';
import { reportRoutes } from './routes/reports.routes.js';
import { orderRoutes } from './routes/orders.routes.js';
import { portalRoutes } from './routes/portal.routes.js';
import { requireAuth } from './middleware/require-auth.js';
import { requireRole } from './middleware/rbac.js';
import { registerEventLogger } from './services/event-logger.js';

const port = Number(process.env.PORT) || 4000;
const host = process.env.HOST ?? '0.0.0.0';
const corsOrigins = process.env.CORS_ORIGINS?.split(',').filter(Boolean) ?? [];

const app = Fastify({
  logger: {
    transport:
      process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss Z' } }
        : undefined,
  },
  bodyLimit: 5 * 1024 * 1024, // 5 MB — supports base64 logo uploads
});

app.setErrorHandler(errorHandler);

if (corsOrigins.length === 0) {
  app.log.warn('CORS_ORIGINS not set — allowing all origins (not suitable for production)');
}

await app.register(cors, {
  origin: corsOrigins.length > 0 ? corsOrigins : true,
  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
});
await app.register(authPlugin);
await app.register(orgContextPlugin);
await app.register(authRoutes);
await app.register(syncRoutes);
await app.register(categoryRoutes);
await app.register(modifierGroupRoutes);
await app.register(modifierRoutes);
await app.register(productRoutes);
await app.register(receiptRoutes);
await app.register(organizationRoutes);
await app.register(userRoutes);
await app.register(dashboardRoutes);
await app.register(terminalRoutes);
await app.register(activityRoutes);
await app.register(reportRoutes);
await app.register(orderRoutes);
await app.register(portalRoutes);

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
