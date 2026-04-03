import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import type { FastifyInstance } from 'fastify';

export interface JwtPayload {
  userId: string;
  orgId: string;
  role: string;
  permissions: string[];
  purpose?: string;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

export const authPlugin = fp(async (app: FastifyInstance) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('Missing required env var: JWT_SECRET');
  }

  await app.register(fastifyJwt, { secret });
});
