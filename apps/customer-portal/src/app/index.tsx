import { CustomerDashboard } from "@/components/CustomerDashboard";

// Only reachable once AuthProvider reports "ready" (see _layout.tsx).
export default function VaultScreen() {
  return <CustomerDashboard />;
}
