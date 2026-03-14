'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TabItemProps {
  href: string;
  label: string;
  icon: LucideIcon;
}

export function TabItem({ href, label, icon: Icon }: TabItemProps) {
  const pathname = usePathname();
  const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={cn(
        'flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors',
        isActive
          ? 'text-tab-bar-active font-medium'
          : 'text-tab-bar-foreground hover:text-foreground'
      )}
    >
      <Icon className="h-5 w-5" />
      <span>{label}</span>
    </Link>
  );
}
