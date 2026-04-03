import {
  Coffee,
  CupSoda,
  Beer,
  Wine,
  Milk,
  IceCreamCone,
  Croissant,
  Pizza,
  Sandwich,
  Soup,
  Salad,
  Cookie,
  Cake,
  Cherry,
  Apple,
  Grape,
  Citrus,
  Beef,
  Fish,
  Egg,
  Wheat,
  Leaf,
  Flame,
  Snowflake,
  Star,
  Heart,
  Sparkles,
  Utensils,
  ChefHat,
  Store,
  type LucideProps,
} from 'lucide-react';
import type { FC } from 'react';

// ---------------------------------------------------------------------------
// Icon registry — maps stored name string → Lucide component
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, FC<LucideProps>> = {
  Coffee,
  CupSoda,
  Beer,
  Wine,
  Milk,
  IceCreamCone,
  Croissant,
  Pizza,
  Sandwich,
  Soup,
  Salad,
  Cookie,
  Cake,
  Cherry,
  Apple,
  Grape,
  Citrus,
  Beef,
  Fish,
  Egg,
  Wheat,
  Leaf,
  Flame,
  Snowflake,
  Star,
  Heart,
  Sparkles,
  Utensils,
  ChefHat,
  Store,
};

export const CATEGORY_ICON_NAMES = Object.keys(ICON_MAP);

interface CategoryIconProps extends Omit<LucideProps, 'name'> {
  name: string | null | undefined;
}

export function CategoryIcon({ name, ...props }: CategoryIconProps) {
  if (!name) return null;
  const Icon = ICON_MAP[name];
  if (!Icon) return null;
  return <Icon {...props} />;
}
