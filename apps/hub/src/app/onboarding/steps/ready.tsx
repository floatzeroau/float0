'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, ChevronDown, Tablet } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ReadyProps {
  onComplete: () => void;
  onBack: () => void;
}

export function Ready({ onComplete, onBack }: ReadyProps) {
  const [ipadOpen, setIpadOpen] = useState(false);
  const [marked, setMarked] = useState(false);

  // Mark onboarding as completed
  useEffect(() => {
    if (!marked) {
      setMarked(true);
      api
        .patch('/organizations/me/settings', {
          onboarding_status: 'completed',
          onboarding_step: 4,
        })
        .catch(() => {});
    }
  }, [marked]);

  return (
    <Card>
      <CardContent className="pt-8 pb-8">
        <div className="flex flex-col items-center text-center space-y-6">
          {/* Success icon */}
          <div className="relative">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            {/* Confetti dots */}
            <span className="absolute -top-2 -left-2 h-2 w-2 rounded-full bg-primary animate-bounce" />
            <span className="absolute -top-1 right-0 h-1.5 w-1.5 rounded-full bg-yellow-400 animate-bounce [animation-delay:150ms]" />
            <span className="absolute bottom-0 -right-3 h-2 w-2 rounded-full bg-green-400 animate-bounce [animation-delay:300ms]" />
            <span className="absolute -bottom-1 -left-1 h-1.5 w-1.5 rounded-full bg-pink-400 animate-bounce [animation-delay:450ms]" />
          </div>

          {/* Text */}
          <div className="space-y-2">
            <h2 className="text-2xl font-bold">You&apos;re all set!</h2>
            <p className="text-muted-foreground max-w-sm">
              Your business is ready to go. Head to the dashboard to start managing your cafe.
            </p>
          </div>

          {/* CTA */}
          <Button size="lg" onClick={onComplete} className="min-w-[200px]">
            Go to Dashboard
          </Button>

          {/* iPad instructions */}
          <div className="w-full max-w-md text-left">
            <button
              type="button"
              onClick={() => setIpadOpen((o) => !o)}
              className="flex w-full items-center justify-between rounded-lg border p-4 text-sm font-medium hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Tablet className="h-4 w-4 text-muted-foreground" />
                How to connect your POS iPad
              </div>
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-muted-foreground transition-transform',
                  ipadOpen && 'rotate-180',
                )}
              />
            </button>
            {ipadOpen && (
              <div className="mt-2 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground space-y-2">
                <p>
                  <strong className="text-foreground">1.</strong> Download the Float0 POS app from
                  the App Store on your iPad.
                </p>
                <p>
                  <strong className="text-foreground">2.</strong> Open the app and tap &quot;Connect
                  to Business&quot;.
                </p>
                <p>
                  <strong className="text-foreground">3.</strong> Sign in with the same email and
                  password you registered with.
                </p>
                <p>
                  <strong className="text-foreground">4.</strong> Your menu and settings will sync
                  automatically.
                </p>
              </div>
            )}
          </div>

          {/* Back */}
          <Button type="button" variant="ghost" size="sm" onClick={onBack}>
            Back to previous step
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
