import { Card, CardContent } from '@/components/ui/card';
import { Users } from 'lucide-react';

export default function CustomersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Customers</h1>
        <p className="text-sm text-muted-foreground">Manage your customer database</p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <div className="rounded-full bg-muted p-4">
            <Users className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">Customer management coming soon</h2>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            Customer profiles, loyalty programmes, and purchase history tracking are on the way.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
