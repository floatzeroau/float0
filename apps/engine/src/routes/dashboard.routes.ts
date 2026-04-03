import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/require-auth.js';
import { getDashboardSummary, getSalesChart } from './dashboard.service.js';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const summaryQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD format')
    .optional(),
  timezone: z.string().optional(),
});

const salesChartQuerySchema = z.object({
  period: z.enum(['hourly', 'daily', 'weekly']).optional().default('hourly'),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD format')
    .optional(),
  timezone: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/dashboard/summary', { preHandler: [requireAuth] }, async (request, reply) => {
    const query = summaryQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        statusCode: 400,
        details: query.error.flatten().fieldErrors,
      });
    }

    const date = query.data.date ?? new Date().toISOString().slice(0, 10);
    const timezone = query.data.timezone ?? 'Australia/Melbourne';

    const summary = await getDashboardSummary(request.user.orgId, date, timezone);
    return reply.send(summary);
  });

  app.get('/dashboard/sales-chart', { preHandler: [requireAuth] }, async (request, reply) => {
    const query = salesChartQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        statusCode: 400,
        details: query.error.flatten().fieldErrors,
      });
    }

    const date = query.data.date ?? new Date().toISOString().slice(0, 10);
    const timezone = query.data.timezone ?? 'Australia/Melbourne';

    const result = await getSalesChart(request.user.orgId, query.data.period, date, timezone);
    return reply.send(result);
  });
}
