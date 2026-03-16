import { eventBus } from '@float0/events';
import type { EventName } from '@float0/events';
import { and, gte, lte, eq } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { eventLog } from '../db/schema/core.js';

export async function replayEvents(
  fromDate: Date,
  toDate: Date,
  eventName?: EventName,
): Promise<number> {
  const conditions = [gte(eventLog.createdAt, fromDate), lte(eventLog.createdAt, toDate)];

  if (eventName) {
    conditions.push(eq(eventLog.eventName, eventName));
  }

  const events = await db
    .select()
    .from(eventLog)
    .where(and(...conditions))
    .orderBy(eventLog.createdAt);

  for (const event of events) {
    eventBus.emit(event.eventName as EventName, event.payload as never);
  }

  return events.length;
}
