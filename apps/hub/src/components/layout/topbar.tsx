import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function Topbar() {
  return (
    <header className="flex h-14 items-center justify-between border-b bg-card px-6">
      <span className="text-sm font-medium text-muted-foreground">My Organisation</span>

      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
        </Button>

        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
          A
        </div>
      </div>
    </header>
  );
}
