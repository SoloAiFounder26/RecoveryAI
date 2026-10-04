import type { RiskLevel } from '@/theme';

// Static mock data for the first UI slice. Replaced by real data once the import flow lands.

export type PriorityAction = 'call' | 'whatsapp' | 'followup' | 'dontChase';

export interface PriorityCustomer {
  id: string;
  name: string;
  risk: RiskLevel;
  outstanding: number;
  daysOverdue: number;
  recoveryChance: number;
  action: PriorityAction;
}

export const currentUser = {
  name: 'Rajesh Kumar',
  firstName: 'Rajesh',
  initials: 'RK',
  role: 'Owner',
};

export const dashboard = {
  opportunity: {
    amount: 870000,
    customersNeedingAttention: 5,
  },
  stats: {
    totalOutstanding: 3240000,
    overdueAmount: 1875000,
    recoveredThisMonth: 1240000,
    recoveryRate: 63,
  },
};

export const priorityCustomers: PriorityCustomer[] = [
  { id: 'abc-traders', name: 'ABC Traders', risk: 'high', outstanding: 480000, daysOverdue: 19, recoveryChance: 74, action: 'call' },
  { id: 'sharma-electrical', name: 'Sharma Electrical', risk: 'high', outstanding: 210000, daysOverdue: 12, recoveryChance: 68, action: 'whatsapp' },
  { id: 'kumar-industries', name: 'Kumar Industries', risk: 'medium', outstanding: 180000, daysOverdue: 8, recoveryChance: 52, action: 'followup' },
  { id: 'xyz-enterprises', name: 'XYZ Enterprises', risk: 'low', outstanding: 45000, daysOverdue: 3, recoveryChance: 28, action: 'dontChase' },
];
