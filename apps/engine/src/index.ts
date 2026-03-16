import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { errorHandler } from './middleware/error-handler.js';
import { authPlugin } from './middleware/auth.js';
import { orgContextPlugin } from './middleware/org-context.js';
import { authRoutes } from './routes/auth.routes.js';

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

app.get('/health', async () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
}));

try {
  await app.listen({ port, host });
} catch (err) {
  app.log.fatal(err);
  process.exit(1);
}
