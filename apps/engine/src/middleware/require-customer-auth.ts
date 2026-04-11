import type { FastifyReply, FastifyRequest } from 'fastify';

export interface CustomerJwtPayload {
  customerId: string;
  orgId: string;
  role: 'customer';
  purpose?: string;
}

export async function requireCustomerAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();

    const payload = request.user as unknown as CustomerJwtPayload;

    if (payload.role !== 'customer') {
      return reply.status(403).send({ error: 'Forbidden', statusCode: 403 });
    }

    if (payload.purpose === 'customer-setup') {
      return reply
        .status(403)
        .send({ error: 'Setup tokens cannot access this resource', statusCode: 403 });
    }

    request.customerId = payload.customerId;
    request.orgId = payload.orgId;
  } catch {
    reply.status(401).send({ error: 'Unauthorized', statusCode: 401 });
  }
}
