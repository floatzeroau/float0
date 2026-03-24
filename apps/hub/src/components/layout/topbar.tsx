'use client';

import { Bell, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';

export function Topbar() {
  const { org, user, logout } = useAuth();

  const initial = user?.role?.charAt(0).toUpperCase() ?? 'U';

  return (
    <header className="flex h-14 items-center justify-between border-b bg-card px-6">
      <span className="text-sm font-medium text-muted-foreground">
        {org?.name ?? 'My Organisation'}
      </span>

      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
        </Button>

        <Button variant="ghost" size="icon" onClick={logout} title="Sign out">
          <LogOut className="h-5 w-5" />
        </Button>

        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
          {initial}
        </div>
      </div>
    </header>
  );
}
