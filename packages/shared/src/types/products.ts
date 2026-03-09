export interface Modifier {
  id: string;
  name: string;
  price: number;
}

export interface ModifierGroup {
  id: string;
  name: string;
  required: boolean;
  multiSelect: boolean;
  modifiers: Modifier[];
}

export interface Category {
  id: string;
  name: string;
  sortOrder: number;
}

export interface Product {
  id: string;
  organizationId: string;
  categoryId: string;
  name: string;
  description: string;
  price: number;
  isActive: boolean;
  modifierGroups: ModifierGroup[];
}
