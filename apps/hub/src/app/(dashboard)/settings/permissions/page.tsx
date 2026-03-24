import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PermissionsMatrix } from '@/components/permissions-matrix';

const roleDescriptions = [
  {
    role: 'Owner',
    variant: 'default' as const,
    description:
      'Full access to everything including billing, organization deletion, and all settings.',
  },
  {
    role: 'Admin',
    variant: 'default' as const,
    description: 'All permissions except billing and org deletion. Can manage staff and settings.',
  },
  {
    role: 'Manager',
    variant: 'secondary' as const,
    description:
      'Products, orders, shifts, reports, customers, and loyalty. No staff or settings management.',
  },
  {
    role: 'Staff',
    variant: 'outline' as const,
    description:
      'Basic POS access: view products, create orders, process payments, view customers.',
  },
];

export default function PermissionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Roles & Permissions</h2>
        <p className="text-sm text-muted-foreground">
          Overview of what each role can access. Permissions are read-only for now.
        </p>
      </div>

      {/* Role summary cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {roleDescriptions.map((r) => (
          <Card key={r.role}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Badge variant={r.variant}>{r.role}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground leading-relaxed">{r.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Permission matrix */}
      <PermissionsMatrix />
    </div>
  );
}
