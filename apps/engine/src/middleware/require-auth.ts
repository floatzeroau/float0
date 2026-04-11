import type { FastifyReply, FastifyRequest } from 'fastify';

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();

    if (request.user.role === 'customer') {
      return reply.status(403).send({ error: 'Forbidden', statusCode: 403 });
    }

    request.orgId = request.user.orgId;
  } catch {
    reply.status(401).send({ error: 'Unauthorized', statusCode: 401 });
  }
}
