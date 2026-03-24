'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const settingsNav = [
  { href: '/settings/team', label: 'Team' },
  { href: '/settings/permissions', label: 'Roles & Permissions' },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your organization settings</p>
      </div>

      <div className="flex flex-col gap-6 md:flex-row">
        <nav className="flex gap-1 md:w-48 md:flex-col md:gap-0.5">
          {settingsNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted',
                pathname === item.href ? 'bg-muted text-foreground' : 'text-muted-foreground',
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
