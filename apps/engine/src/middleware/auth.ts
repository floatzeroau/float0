import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';

export const authPlugin = fp(async (_app: FastifyInstance) => {
  // Stub — JWT verification will be implemented when auth is wired up.
  // For now this is a pass-through so the plugin can be registered early.
});
