'use client';

import { useState } from 'react';
import {
  LayoutDashboard,
  Package,
  Tags,
  Layers,
  Users,
  UserCog,
  BarChart3,
  Settings,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SidebarNavItem } from './sidebar-nav-item';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/products', label: 'Products', icon: Package },
  { href: '/categories', label: 'Categories', icon: Tags },
  { href: '/modifiers', label: 'Modifiers', icon: Layers },
  { href: '/customers', label: 'Customers', icon: Users },
  { href: '/settings/team', label: 'Staff', icon: UserCog },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        'flex h-screen flex-col bg-sidebar text-sidebar-foreground transition-all duration-200',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      <div className="flex h-14 items-center justify-between px-4">
        {!collapsed && <span className="text-lg font-bold tracking-tight">Float0</span>}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="rounded-md p-1.5 hover:bg-sidebar-accent"
        >
          {collapsed ? <PanelLeft className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </button>
      </div>

      <nav className="flex-1 space-y-1 px-2 py-4">
        {navItems.map((item) => (
          <SidebarNavItem key={item.href} collapsed={collapsed} {...item} />
        ))}
      </nav>
    </aside>
  );
}
