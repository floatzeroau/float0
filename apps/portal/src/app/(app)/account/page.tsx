import { User } from 'lucide-react';

export default function AccountPage() {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <User className="h-12 w-12 text-muted-foreground" />
      <h1 className="mt-4 text-2xl font-bold">Account</h1>
      <p className="mt-2 text-muted-foreground">Manage your account settings</p>
    </div>
  );
}
