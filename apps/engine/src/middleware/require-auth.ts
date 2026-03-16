import type { FastifyReply, FastifyRequest } from 'fastify';

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
    request.orgId = request.user.orgId;
  } catch {
    reply.status(401).send({ error: 'Unauthorized', statusCode: 401 });
  }
}
