'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InviteUserModal } from '@/components/invite-user-modal';
import { StaffTable } from '@/components/staff-table';
import { api } from '@/lib/api';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TeamMember {
  id: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  hasPinSet: boolean;
  lastActiveAt: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMembers = useCallback(() => {
    setLoading(true);
    api
      .get<TeamMember[]>('/users')
      .then(setMembers)
      .catch(() => toast.error('Failed to load team members'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Team Members</h2>
          <p className="text-sm text-muted-foreground">
            Manage staff access and roles for your organization
          </p>
        </div>
        <InviteUserModal onInvited={fetchMembers} />
      </div>

      {/* Staff Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Staff</CardTitle>
        </CardHeader>
        <CardContent>
          <StaffTable members={members} loading={loading} onRefresh={fetchMembers} />
        </CardContent>
      </Card>
    </div>
  );
}
