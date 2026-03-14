import { ShoppingBag } from 'lucide-react';

export default function OrdersPage() {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <ShoppingBag className="h-12 w-12 text-muted-foreground" />
      <h1 className="mt-4 text-2xl font-bold">Orders</h1>
      <p className="mt-2 text-muted-foreground">No orders yet</p>
    </div>
  );
}
