'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, BookOpen, Coffee, User } from 'lucide-react';
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
    { path: `/${slug}/menu`, label: 'Menu', icon: BookOpen },
    { path: `/${slug}/my-packs`, label: 'My Packs', icon: Coffee },
    { path: `/${slug}/account`, label: 'Account', icon: User },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-white">
      <div className="mx-auto flex max-w-[480px]">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive =
            tab.path === `/${slug}` ? pathname === `/${slug}` : pathname.startsWith(tab.path);

          return (
            <Link
              key={tab.path}
              href={tab.path}
              className={cn(
                'flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs transition-colors',
                isActive
                  ? 'font-medium text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
