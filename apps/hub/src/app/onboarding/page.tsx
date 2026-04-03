'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { OnboardingStepper } from '@/components/onboarding-stepper';
import { BusinessProfile } from './steps/business-profile';
import { MenuSetup } from './steps/menu-setup';
import { InviteTeam } from './steps/invite-team';
import { PosConfig } from './steps/pos-config';
import { Ready } from './steps/ready';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OrgData {
  id: string;
  name: string;
  abn?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string | { street?: string; suburb?: string; state?: string; postcode?: string };
  timezone?: string;
  logoUrl?: string;
  settings?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEPS = ['Business Profile', 'Menu', 'Team', 'POS Settings', 'Ready!'];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [org, setOrg] = useState<OrgData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      router.push('/login');
      return;
    }

    api
      .get<OrgData>('/organizations/me')
      .then((data) => {
        setOrg(data);
        // Resume from saved step
        const savedStep = data.settings?.onboarding_status;
        const stepNum =
          typeof savedStep === 'string'
            ? parseInt(savedStep, 10)
            : typeof savedStep === 'number'
              ? savedStep
              : NaN;
        if (!isNaN(stepNum) && stepNum >= 0 && stepNum <= 4) {
          setCurrentStep(stepNum);
        }
      })
      .catch(() => {
        // API may not be ready yet — show wizard from step 0
      })
      .finally(() => setLoading(false));
  }, [router]);

  function persistStep(step: number) {
    api.patch('/organizations/me/settings', { onboarding_status: String(step) }).catch(() => {});
  }

  function handleNext() {
    const next = currentStep + 1;
    setCurrentStep(next);
    persistStep(next);
  }

  function handleBack() {
    setCurrentStep((s) => Math.max(0, s - 1));
  }

  function handleComplete() {
    router.push('/dashboard');
  }

  function handleOrgUpdate(updated: Partial<OrgData>) {
    setOrg((prev) => (prev ? { ...prev, ...updated } : prev));
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-lg font-semibold">Set up your business</h1>
          {currentStep < 4 && (
            <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
              Skip for now
            </Link>
          )}
        </div>

        {/* Stepper */}
        <OnboardingStepper steps={STEPS} currentStep={currentStep} />

        {/* Step content */}
        <div className="mt-8">
          {currentStep === 0 && (
            <BusinessProfile org={org} onNext={handleNext} onOrgUpdate={handleOrgUpdate} />
          )}
          {currentStep === 1 && <MenuSetup onNext={handleNext} onBack={handleBack} />}
          {currentStep === 2 && <InviteTeam onNext={handleNext} onBack={handleBack} />}
          {currentStep === 3 && <PosConfig org={org} onNext={handleNext} onBack={handleBack} />}
          {currentStep === 4 && <Ready onComplete={handleComplete} onBack={handleBack} />}
        </div>
      </div>
    </div>
  );
}
