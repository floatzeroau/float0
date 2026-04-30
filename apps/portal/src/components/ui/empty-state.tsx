import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
        <Icon className="h-7 w-7 text-primary" aria-hidden />
      </div>
      <h3 className="mt-4 text-h2 font-semibold">{title}</h3>
      {description && (
        <p className="mt-1 max-w-xs text-small text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
