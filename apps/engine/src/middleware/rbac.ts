import type { FastifyReply, FastifyRequest } from 'fastify';
import { ROLE_HIERARCHY } from '@float0/shared';
import type { OrgRole } from '@float0/shared';
import { db } from '../db/connection.js';
import { auditLog } from '../db/schema/core.js';

function getRoleLevel(role: string): number {
  return ROLE_HIERARCHY[role as OrgRole] ?? 0;
}

export function requireRole(minRole: OrgRole) {
  const minLevel = getRoleLevel(minRole);

  return async function checkRole(request: FastifyRequest, reply: FastifyReply) {
    const userLevel = getRoleLevel(request.user.role);

    if (userLevel < minLevel) {
      // Log the 403 to audit_log
      await db
        .insert(auditLog)
        .values({
          organizationId: request.user.orgId,
          userId: request.user.userId,
          action: 'rbac.role_denied',
          entityType: 'route',
          changes: {
            required: minRole,
            actual: request.user.role,
            path: request.url,
            method: request.method,
          },
          ipAddress: request.ip,
        })
        .catch(() => {
          // Don't block the response if audit logging fails
        });

      return reply.status(403).send({
        error: 'Forbidden',
        statusCode: 403,
        message: `Requires ${minRole} role or higher`,
      });
    }
  };
}

export function requirePermission(permission: string) {
  return async function checkPermission(request: FastifyRequest, reply: FastifyReply) {
    const has = request.user.permissions?.includes(permission);

    if (!has) {
      await db
        .insert(auditLog)
        .values({
          organizationId: request.user.orgId,
          userId: request.user.userId,
          action: 'rbac.permission_denied',
          entityType: 'route',
          changes: {
            required: permission,
            actual: request.user.permissions,
            path: request.url,
            method: request.method,
          },
          ipAddress: request.ip,
        })
        .catch(() => {
          // Don't block the response if audit logging fails
        });

      return reply.status(403).send({
        error: 'Forbidden',
        statusCode: 403,
        message: `Missing permission: ${permission}`,
      });
    }
  };
}
