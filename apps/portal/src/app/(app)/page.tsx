import { CURRENCY, TIMEZONE } from '@float0/shared';

export default function DashboardPage() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">Welcome</h1>
      <p className="mt-2 text-muted-foreground">Your Float0 customer portal</p>
      <div className="mt-4 rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        <p>Currency: {CURRENCY}</p>
        <p>Timezone: {TIMEZONE}</p>
      </div>
    </div>
  );
}
