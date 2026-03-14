import { TopBar } from '@/components/layout/top-bar';
import { BottomTabs } from '@/components/layout/bottom-tabs';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <TopBar />
      <main className="flex-1 overflow-y-auto pb-16">{children}</main>
      <BottomTabs />
    </div>
  );
}
