import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/require-auth.js';
import { getSalesReport, salesReportToCsv } from './reports.service.js';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const salesQuerySchema = z.object({
  from: z.string().regex(datePattern, 'Expected YYYY-MM-DD'),
  to: z.string().regex(datePattern, 'Expected YYYY-MM-DD'),
  timezone: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function reportRoutes(app: FastifyInstance) {
  // JSON report
  app.get('/reports/sales', { preHandler: [requireAuth] }, async (request, reply) => {
    const query = salesQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        statusCode: 400,
        details: query.error.flatten().fieldErrors,
      });
    }

    const timezone = query.data.timezone ?? 'Australia/Melbourne';
    const report = await getSalesReport(
      request.user.orgId,
      query.data.from,
      query.data.to,
      timezone,
    );
    return reply.send(report);
  });

  // CSV export
  app.get('/reports/sales/export', { preHandler: [requireAuth] }, async (request, reply) => {
    const query = salesQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        statusCode: 400,
        details: query.error.flatten().fieldErrors,
      });
    }

    const timezone = query.data.timezone ?? 'Australia/Melbourne';
    const report = await getSalesReport(
      request.user.orgId,
      query.data.from,
      query.data.to,
      timezone,
    );

    const csv = salesReportToCsv(report, query.data.from, query.data.to);
    const filename = `sales-report-${query.data.from}-to-${query.data.to}.csv`;

    return reply
      .header('Content-Type', 'text/csv')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(csv);
  });
}
