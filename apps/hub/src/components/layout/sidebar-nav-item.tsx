'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarNavItemProps {
  href: string;
  label: string;
  icon: LucideIcon;
  collapsed: boolean;
}

export function SidebarNavItem({
  href,
  label,
  icon: Icon,
  collapsed,
}: SidebarNavItemProps) {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        isActive
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-sidebar-foreground/70',
        collapsed && 'justify-center px-2',
      )}
      title={collapsed ? label : undefined}
    >
      <Icon className="h-5 w-5 shrink-0" />
      {!collapsed && <span>{label}</span>}
    </Link>
  );
}
