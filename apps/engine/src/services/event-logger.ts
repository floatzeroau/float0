import { eventBus } from '@float0/events';
import type { EventName } from '@float0/events';
import { db } from '../db/connection.js';
import { eventLog } from '../db/schema/core.js';

export function registerEventLogger() {
  eventBus.onAny(async (eventName: EventName, payload: unknown) => {
    const data = payload as Record<string, unknown>;
    const organizationId = data.organizationId as string | undefined;

    if (!organizationId) {
      console.error(
        `[EventLogger] Event "${eventName}" missing organizationId, skipping persistence`,
      );
      return;
    }

    const sourceModule = eventName.split('.')[0] ?? null;

    await db.insert(eventLog).values({
      organizationId,
      eventName,
      payload: data,
      sourceModule,
      status: 'processed',
      processedAt: new Date(),
    });
  });
}
