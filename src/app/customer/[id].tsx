import { useLocalSearchParams } from 'expo-router';

import { ComingSoon } from '@/components/ComingSoon';
import { priorityCustomers } from '@/data/mock';

export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const customer = priorityCustomers.find((c) => c.id === id);
  return <ComingSoon title={customer?.name ?? 'Customer'} icon="business" detail={customer?.phone} />;
}
