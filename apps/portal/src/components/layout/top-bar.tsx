'use client';

import { useRouter, usePathname } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

const rootRoutes = ['/', '/orders', '/loyalty', '/account'];

export function TopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const isRoot = rootRoutes.includes(pathname);

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center border-b bg-card px-4">
      <div className="flex flex-1 items-center">
        {!isRoot && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
            className="mr-2"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
        )}
      </div>
      <span className="text-base font-semibold text-foreground">Float0</span>
      <div className="flex-1" />
    </header>
  );
}
