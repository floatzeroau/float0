'use client';

import { TIMEZONE } from '@float0/shared';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface RecentOrder {
  id: string;
  orderNumber: string;
  orderType: string;
  status: string;
  total: number;
  paymentMethod: string | null;
  createdAt: string;
}

interface RecentOrdersTableProps {
  orders: RecentOrder[];
}

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  completed: 'default',
  open: 'outline',
  draft: 'secondary',
  voided: 'destructive',
  refunded: 'destructive',
};

const orderTypeLabels: Record<string, string> = {
  dine_in: 'Dine In',
  takeaway: 'Takeaway',
  delivery: 'Delivery',
};

const paymentLabels: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  mobile: 'Mobile',
  voucher: 'Voucher',
  split: 'Split',
};

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TIMEZONE,
  });
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(amount);
}

export function RecentOrdersTable({ orders }: RecentOrdersTableProps) {
  if (orders.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No orders yet today.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Order #</TableHead>
          <TableHead>Time</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Payment</TableHead>
          <TableHead className="text-right">Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((order) => (
          <TableRow key={order.id}>
            <TableCell className="font-medium">{order.orderNumber}</TableCell>
            <TableCell>{formatTime(order.createdAt)}</TableCell>
            <TableCell>{orderTypeLabels[order.orderType] ?? order.orderType}</TableCell>
            <TableCell>
              <Badge variant={statusVariant[order.status] ?? 'secondary'}>{order.status}</Badge>
            </TableCell>
            <TableCell>
              {order.paymentMethod
                ? (paymentLabels[order.paymentMethod] ?? order.paymentMethod)
                : '—'}
            </TableCell>
            <TableCell className="text-right">{formatCurrency(order.total)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
