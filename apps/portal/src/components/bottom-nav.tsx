'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Coffee, Clock, User } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BottomNavProps {
  slug: string;
}

interface Tab {
  path: string;
  label: string;
  icon: LucideIcon;
}

export function BottomNav({ slug }: BottomNavProps) {
  const pathname = usePathname();

  const tabs: Tab[] = [
    { path: `/${slug}`, label: 'Home', icon: Home },
    { path: `/${slug}/my-packs`, label: 'My Packs', icon: Coffee },
    { path: `/${slug}/history`, label: 'History', icon: Clock },
    { path: `/${slug}/account`, label: 'Account', icon: User },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-tab-bar pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_3px_rgb(45_33_26_/_0.04)]">
      <div className="mx-auto flex max-w-[480px]">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive =
            tab.path === `/${slug}` ? pathname === `/${slug}` : pathname.startsWith(tab.path);

          return (
            <Link
              key={tab.path}
              href={tab.path}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 text-micro font-medium transition-colors',
                isActive ? 'text-tab-bar-active' : 'text-tab-bar-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={isActive ? 2.25 : 1.75} />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
