import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';

interface OnboardingStepperProps {
  steps: string[];
  currentStep: number;
}

export function OnboardingStepper({ steps, currentStep }: OnboardingStepperProps) {
  return (
    <nav aria-label="Onboarding progress" className="w-full">
      <ol className="flex items-center justify-between">
        {steps.map((label, i) => {
          const isCompleted = i < currentStep;
          const isCurrent = i === currentStep;

          return (
            <li key={label} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-medium transition-colors',
                    isCompleted && 'border-primary bg-primary text-primary-foreground',
                    isCurrent && 'border-primary bg-background text-primary',
                    !isCompleted &&
                      !isCurrent &&
                      'border-muted-foreground/30 bg-background text-muted-foreground/50',
                  )}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  {isCompleted ? <Check className="h-4 w-4" /> : i + 1}
                </div>
                <span
                  className={cn(
                    'text-xs font-medium whitespace-nowrap',
                    isCurrent ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {label}
                </span>
              </div>

              {/* Connector line */}
              {i < steps.length - 1 && (
                <div
                  className={cn(
                    'mx-2 mb-5 h-0.5 flex-1',
                    i < currentStep ? 'bg-primary' : 'bg-muted-foreground/20',
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
