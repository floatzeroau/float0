'use client';

import { Home, ShoppingBag, Heart, User } from 'lucide-react';
import { TabItem } from './tab-item';

const tabs = [
  { href: '/', label: 'Dashboard', icon: Home },
  { href: '/orders', label: 'Orders', icon: ShoppingBag },
  { href: '/loyalty', label: 'Loyalty', icon: Heart },
  { href: '/account', label: 'Account', icon: User },
] as const;

export function BottomTabs() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t bg-tab-bar">
      {tabs.map((tab) => (
        <TabItem key={tab.href} {...tab} />
      ))}
    </nav>
  );
}
