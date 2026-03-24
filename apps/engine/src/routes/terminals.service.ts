import { eq, and, sql, desc, gte, isNull } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { shifts, orders } from '../db/schema/pos.js';
import { users } from '../db/schema/core.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TerminalStatus {
  terminalId: string;
  status: 'online' | 'offline';
  lastActivityAt: string | null;
  shiftStatus: 'open' | 'closed' | null;
  shiftOpenedAt: string | null;
  staffName: string | null;
  orderCount: number;
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export async function listTerminals(orgId: string): Promise<TerminalStatus[]> {
  // Get all distinct terminal IDs from shifts (last 30 days) to discover known terminals
  const thirtyDaysAgo = sql`now() - interval '30 days'`;

  const terminalShifts = await db
    .select({
      terminalId: shifts.terminalId,
      shiftStatus: shifts.status,
      shiftOpenedAt: shifts.openedAt,
      staffId: shifts.staffId,
      updatedAt: shifts.updatedAt,
    })
    .from(shifts)
    .where(
      and(
        eq(shifts.organizationId, orgId),
        isNull(shifts.deletedAt),
        gte(shifts.createdAt, thirtyDaysAgo),
      ),
    )
    .orderBy(desc(shifts.openedAt));

  // Group by terminalId — keep most recent shift per terminal
  const terminalMap = new Map<
    string,
    {
      shiftStatus: string;
      shiftOpenedAt: Date;
      staffId: string;
      updatedAt: Date;
    }
  >();

  for (const row of terminalShifts) {
    if (!terminalMap.has(row.terminalId)) {
      terminalMap.set(row.terminalId, {
        shiftStatus: row.shiftStatus,
        shiftOpenedAt: row.shiftOpenedAt,
        staffId: row.staffId,
        updatedAt: row.updatedAt,
      });
    }
  }

  if (terminalMap.size === 0) {
    return [];
  }

  // Get last order timestamp per terminal (last 24h)
  const oneDayAgo = sql`now() - interval '24 hours'`;
  const lastOrders = await db
    .select({
      terminalId: orders.terminalId,
      lastOrderAt: sql<string>`max(${orders.createdAt})`,
      orderCount: sql<number>`cast(count(*) as int)`,
    })
    .from(orders)
    .where(and(eq(orders.organizationId, orgId), gte(orders.createdAt, oneDayAgo)))
    .groupBy(orders.terminalId);

  const orderMap = new Map(
    lastOrders.map((r) => [
      r.terminalId,
      { lastOrderAt: r.lastOrderAt, orderCount: Number(r.orderCount) },
    ]),
  );

  // Get staff names
  const staffIds = [...new Set([...terminalMap.values()].map((t) => t.staffId))];
  const staffRows =
    staffIds.length > 0
      ? await db
          .select({
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
          })
          .from(users)
          .where(sql`${users.id} = ANY(${staffIds})`)
      : [];

  const staffMap = new Map(staffRows.map((s) => [s.id, `${s.firstName} ${s.lastName}`]));

  // Assemble results
  const twoMinutesAgo = Date.now() - 2 * 60 * 1000;
  const results: TerminalStatus[] = [];

  for (const [terminalId, shift] of terminalMap) {
    const orderInfo = orderMap.get(terminalId);
    // Use the most recent timestamp: shift updatedAt or last order
    const lastActivityTimestamp = orderInfo?.lastOrderAt
      ? new Date(orderInfo.lastOrderAt)
      : shift.updatedAt;
    const isOnline =
      shift.shiftStatus === 'open' && lastActivityTimestamp.getTime() > twoMinutesAgo;

    results.push({
      terminalId,
      status: isOnline ? 'online' : 'offline',
      lastActivityAt: lastActivityTimestamp.toISOString(),
      shiftStatus: shift.shiftStatus === 'open' ? 'open' : 'closed',
      shiftOpenedAt: shift.shiftOpenedAt.toISOString(),
      staffName: staffMap.get(shift.staffId) ?? null,
      orderCount: orderInfo?.orderCount ?? 0,
    });
  }

  // Sort: online first, then by terminalId
  results.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'online' ? -1 : 1;
    return a.terminalId.localeCompare(b.terminalId);
  });

  return results;
}
