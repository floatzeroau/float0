import { CURRENCY, TIMEZONE } from '@float0/shared';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const stats = [
  { title: 'Revenue Today', value: '$1,284.00', change: '+12%' },
  { title: 'Orders', value: '42', change: '+8%' },
  { title: 'Customers', value: '1,205', change: '+3%' },
  { title: 'Avg Order Value', value: '$30.57', change: '-2%' },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Currency: {CURRENCY} &middot; Timezone: {TIMEZONE}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <Badge
                variant={stat.change.startsWith('+') ? 'default' : 'secondary'}
              >
                {stat.change}
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
