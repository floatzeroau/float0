export interface Customer {
  id: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  loyaltyPoints: number;
  loyaltyTier: string;
  createdAt: Date;
}

export interface CustomerGroup {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  customerIds: string[];
}
