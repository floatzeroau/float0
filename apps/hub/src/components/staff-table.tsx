'use client';

import { useMemo, useState } from 'react';
import { ArrowUpDown, Search, Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EditStaffModal } from '@/components/edit-staff-modal';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StaffMember {
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

interface StaffTableProps {
  members: StaffMember[];
  loading: boolean;
  onRefresh: () => void;
}

type SortKey = 'name' | 'role' | 'lastActive';
type SortDir = 'asc' | 'desc';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const roleOrder: Record<string, number> = { owner: 0, admin: 1, manager: 2, staff: 3 };

const roleVariant: Record<string, 'default' | 'secondary' | 'outline'> = {
  owner: 'default',
  admin: 'default',
  manager: 'secondary',
  staff: 'outline',
};

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StaffTable({ members, loading, onRefresh }: StaffTableProps) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [editMember, setEditMember] = useState<StaffMember | null>(null);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let list = members;

    if (q) {
      list = list.filter(
        (m) =>
          `${m.firstName} ${m.lastName}`.toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q),
      );
    }

    list = [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name':
          cmp = `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
          break;
        case 'role':
          cmp = (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9);
          break;
        case 'lastActive': {
          const aTime = a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0;
          const bTime = b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0;
          cmp = aTime - bTime;
          break;
        }
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return list;
  }, [members, search, sortKey, sortDir]);

  const activeCount = members.filter((m) => m.isActive).length;
  const inactiveCount = members.filter((m) => !m.isActive).length;

  function SortHeader({ label, field }: { label: string; field: SortKey }) {
    return (
      <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => toggleSort(field)}>
        {label}
        <ArrowUpDown
          className={cn('ml-1 h-3 w-3', sortKey === field ? 'opacity-100' : 'opacity-40')}
        />
      </Button>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary + Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {activeCount} active staff{inactiveCount > 0 ? `, ${inactiveCount} inactive` : ''}
        </p>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
              <div className="flex-1 space-y-1">
                <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                <div className="h-3 w-48 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {search ? 'No staff members match your search.' : 'No staff members found.'}
        </p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <SortHeader label="Name" field="name" />
                </TableHead>
                <TableHead>Email</TableHead>
                <TableHead>
                  <SortHeader label="Role" field="role" />
                </TableHead>
                <TableHead>Status</TableHead>
                <TableHead>POS PIN</TableHead>
                <TableHead>
                  <SortHeader label="Last Active" field="lastActive" />
                </TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                        {member.firstName[0]}
                        {member.lastName[0]}
                      </div>
                      <span className="font-medium">
                        {member.firstName} {member.lastName}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{member.email}</TableCell>
                  <TableCell>
                    <Badge variant={roleVariant[member.role] ?? 'outline'}>{member.role}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={member.isActive ? 'default' : 'secondary'}>
                      {member.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        'text-sm',
                        member.hasPinSet ? 'text-emerald-600' : 'text-muted-foreground',
                      )}
                    >
                      {member.hasPinSet ? 'Yes' : 'No'}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {member.lastActiveAt ? relativeTime(member.lastActiveAt) : 'Never'}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setEditMember(member)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <EditStaffModal
        member={editMember}
        open={!!editMember}
        onOpenChange={(v) => {
          if (!v) setEditMember(null);
        }}
        onUpdated={onRefresh}
      />
    </div>
  );
}
