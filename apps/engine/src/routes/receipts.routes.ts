import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { organizations } from '../db/schema/core.js';
import { orders, orderItems, payments, customers, products } from '../db/schema/pos.js';
import { requireAuth } from '../middleware/require-auth.js';
import { buildReceipt } from '@float0/shared';
import type {
  ReceiptBusinessInfo,
  ReceiptOrderInput,
  ReceiptItemInput,
  ReceiptPaymentInput,
  OrgReceiptSettings,
} from '@float0/shared';
import { getEmailService } from '../services/email-service.js';
import { buildReceiptEmailHtml, buildReceiptEmailSubject } from '../templates/receipt-email.js';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const emailReceiptSchema = z.object({
  orderId: z.string().uuid(),
  email: z.string().email(),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function receiptRoutes(app: FastifyInstance) {
  app.post('/receipts/email', { preHandler: [requireAuth] }, async (request, reply) => {
    const parsed = emailReceiptSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        statusCode: 400,
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { orderId, email } = parsed.data;
    const orgId = request.user.orgId;

    // Fetch order
    const [order] = await db
      .select()
      .from(orders)
      .where(
        and(eq(orders.id, orderId), eq(orders.organizationId, orgId), isNull(orders.deletedAt)),
      )
      .limit(1);

    if (!order) {
      return reply.status(404).send({ error: 'Order not found', statusCode: 404 });
    }

    // Fetch org
    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);

    if (!org) {
      return reply.status(404).send({ error: 'Organization not found', statusCode: 404 });
    }

    // Fetch items with product names
    const items = await db
      .select({
        quantity: orderItems.quantity,
        unitPrice: orderItems.unitPrice,
        lineTotal: orderItems.lineTotal,
        modifiersJson: orderItems.modifiersJson,
        notes: orderItems.notes,
        voidedAt: orderItems.voidedAt,
        productName: products.name,
        isGstFree: products.isGstFree,
      })
      .from(orderItems)
      .innerJoin(products, eq(orderItems.productId, products.id))
      .where(
        and(
          eq(orderItems.orderId, orderId),
          eq(orderItems.organizationId, orgId),
          isNull(orderItems.deletedAt),
        ),
      );

    // Fetch payments
    const orderPayments = await db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.orderId, orderId),
          eq(payments.organizationId, orgId),
          isNull(payments.deletedAt),
        ),
      );

    // Fetch customer name if present
    let customerName: string | undefined;
    if (order.customerId) {
      const [customer] = await db
        .select({ firstName: customers.firstName, lastName: customers.lastName })
        .from(customers)
        .where(eq(customers.id, order.customerId))
        .limit(1);
      if (customer) {
        customerName =
          [customer.firstName, customer.lastName].filter(Boolean).join(' ') || undefined;
      }
    }

    // Build receipt
    const receiptSettings = (org.settings as Record<string, unknown>)?.receipt as
      | OrgReceiptSettings
      | undefined;

    const businessInfo: ReceiptBusinessInfo = {
      businessName: org.name,
      abn: org.abn
        ? `${org.abn.slice(0, 2)} ${org.abn.slice(2, 5)} ${org.abn.slice(5, 8)} ${org.abn.slice(8)}`
        : '',
      address: org.address ?? '',
      phone: org.phone ?? '',
      receiptSettings,
    };

    const orderInput: ReceiptOrderInput = {
      orderNumber: order.orderNumber,
      orderType: order.orderType as 'takeaway' | 'dine_in',
      ...(order.tableNumber && { tableNumber: order.tableNumber }),
      subtotal: order.subtotal,
      gstAmount: order.gst,
      discountTotal: order.discountAmount,
      total: order.total,
      createdAt: new Date(order.createdAt).getTime(),
      ...(customerName && { customerName }),
    };

    const receiptItems: ReceiptItemInput[] = items.map((item) => {
      const mods = item.modifiersJson as { name: string }[] | null;
      return {
        productName: item.productName,
        modifiers: mods ? mods.map((m) => m.name) : [],
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
        discountAmount: 0,
        isVoided: item.voidedAt !== null,
        isGstFree: item.isGstFree,
      };
    });

    const receiptPayments: ReceiptPaymentInput[] = orderPayments.map((p) => ({
      method: p.method as 'cash' | 'card',
      amount: p.amount,
      tipAmount: p.tipAmount,
      ...(p.tenderedAmount != null && { tenderedAmount: p.tenderedAmount }),
      ...(p.changeGiven != null && { changeGiven: p.changeGiven }),
      ...(p.roundingAmount != null && { roundingAmount: p.roundingAmount }),
      ...(p.cardType && { cardType: p.cardType }),
      ...(p.lastFour && { lastFour: p.lastFour }),
      ...(p.reference && { approvalCode: p.reference }),
    }));

    const receiptData = buildReceipt(
      businessInfo,
      orderInput,
      receiptItems,
      receiptPayments,
      'Staff',
    );

    // Send email
    const _html = buildReceiptEmailHtml(receiptData);
    const _subject = buildReceiptEmailSubject(receiptData);
    const success = await getEmailService().sendReceipt(email, receiptData);

    return reply.send({ success });
  });
}
