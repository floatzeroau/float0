import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventBus } from './index.js';
import type { EventMap } from './index.js';

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it('calls handler with correct payload when event is emitted', async () => {
    const handler = vi.fn<[EventMap['pos.order.completed']], Promise<void>>().mockResolvedValue();

    bus.on('pos.order.completed', handler);
    bus.emit('pos.order.completed', {
      orderId: 'o1',
      organizationId: 'org1',
      total: 1500,
      items: [{ productId: 'p1', quantity: 2, unitPrice: 750 }],
      timestamp: new Date('2026-01-01'),
    });

    // Let microtask queue flush
    await new Promise((r) => setTimeout(r, 10));

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ orderId: 'o1', total: 1500 }));
  });

  it('calls multiple handlers for the same event', async () => {
    const h1 = vi.fn().mockResolvedValue(undefined);
    const h2 = vi.fn().mockResolvedValue(undefined);

    bus.on('inventory.stock.low', h1);
    bus.on('inventory.stock.low', h2);
    bus.emit('inventory.stock.low', {
      productId: 'p1',
      organizationId: 'org1',
      currentStock: 3,
      threshold: 10,
    });

    await new Promise((r) => setTimeout(r, 10));

    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
  });

  it('handler error does not prevent other handlers from executing', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const h1 = vi.fn().mockRejectedValue(new Error('boom'));
    const h2 = vi.fn().mockResolvedValue(undefined);

    bus.on('inventory.stock.low', h1);
    bus.on('inventory.stock.low', h2);
    bus.emit('inventory.stock.low', {
      productId: 'p1',
      organizationId: 'org1',
      currentStock: 3,
      threshold: 10,
    });

    await new Promise((r) => setTimeout(r, 10));

    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Handler error'),
      expect.any(Error),
    );

    errorSpy.mockRestore();
  });

  it('off() removes a handler', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);

    bus.on('loyalty.tier.changed', handler);
    bus.off('loyalty.tier.changed', handler);
    bus.emit('loyalty.tier.changed', {
      customerId: 'c1',
      organizationId: 'org1',
      oldTier: 'bronze',
      newTier: 'silver',
    });

    await new Promise((r) => setTimeout(r, 10));

    expect(handler).not.toHaveBeenCalled();
  });

  it('wildcard handler receives all events', async () => {
    const wildcard = vi.fn().mockResolvedValue(undefined);

    bus.onAny(wildcard);
    bus.emit('pos.order.completed', {
      orderId: 'o1',
      organizationId: 'org1',
      total: 100,
      items: [],
      timestamp: new Date(),
    });
    bus.emit('inventory.stock.low', {
      productId: 'p1',
      organizationId: 'org1',
      currentStock: 1,
      threshold: 5,
    });

    await new Promise((r) => setTimeout(r, 10));

    expect(wildcard).toHaveBeenCalledTimes(2);
    expect(wildcard).toHaveBeenCalledWith(
      'pos.order.completed',
      expect.objectContaining({ orderId: 'o1' }),
    );
    expect(wildcard).toHaveBeenCalledWith(
      'inventory.stock.low',
      expect.objectContaining({ productId: 'p1' }),
    );
  });

  it('offAny() removes wildcard handler', async () => {
    const wildcard = vi.fn().mockResolvedValue(undefined);

    bus.onAny(wildcard);
    bus.offAny(wildcard);
    bus.emit('pos.order.completed', {
      orderId: 'o1',
      organizationId: 'org1',
      total: 100,
      items: [],
      timestamp: new Date(),
    });

    await new Promise((r) => setTimeout(r, 10));

    expect(wildcard).not.toHaveBeenCalled();
  });

  it('removeAllListeners() clears everything', async () => {
    const h1 = vi.fn().mockResolvedValue(undefined);
    const wildcard = vi.fn().mockResolvedValue(undefined);

    bus.on('pos.order.completed', h1);
    bus.onAny(wildcard);
    bus.removeAllListeners();

    bus.emit('pos.order.completed', {
      orderId: 'o1',
      organizationId: 'org1',
      total: 100,
      items: [],
      timestamp: new Date(),
    });

    await new Promise((r) => setTimeout(r, 10));

    expect(h1).not.toHaveBeenCalled();
    expect(wildcard).not.toHaveBeenCalled();
  });

  it('emit with no handlers does not throw', () => {
    expect(() => {
      bus.emit('pos.order.refunded', {
        orderId: 'o1',
        organizationId: 'org1',
        refundAmount: 500,
        reason: 'test',
        timestamp: new Date(),
      });
    }).not.toThrow();
  });
});
