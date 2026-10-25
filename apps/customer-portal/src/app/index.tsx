import { CustomerDashboard } from "@/components/CustomerDashboard";

// Auth gate (phone OTP + biometric unlock) lands in the next step; until then
// the vault opens directly so the UI can be reviewed.
export default function VaultScreen() {
  return <CustomerDashboard />;
}
