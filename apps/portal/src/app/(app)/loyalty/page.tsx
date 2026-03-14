import { Heart } from 'lucide-react';

export default function LoyaltyPage() {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <Heart className="h-12 w-12 text-muted-foreground" />
      <h1 className="mt-4 text-2xl font-bold">Loyalty</h1>
      <p className="mt-2 text-muted-foreground">0 points</p>
    </div>
  );
}
