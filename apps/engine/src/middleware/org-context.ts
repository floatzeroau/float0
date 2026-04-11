import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    orgId?: string;
    customerId?: string;
  }
}

export const orgContextPlugin = fp(async (app: FastifyInstance) => {
  app.decorateRequest('orgId', undefined);
  app.decorateRequest('customerId', undefined);

  app.addHook('onRequest', async (request: FastifyRequest) => {
    // Stub — will extract orgId from verified JWT claims once auth is wired up.
    // For now, allow an X-Org-Id header for local development.
    const headerVal = request.headers['x-org-id'];
    if (typeof headerVal === 'string') {
      request.orgId = headerVal;
    }
  });
});
