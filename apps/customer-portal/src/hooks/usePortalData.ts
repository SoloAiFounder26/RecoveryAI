import { useCallback, useEffect, useMemo, useState } from "react";
import { mockAccounts, mockCommitments, mockInvoices } from "@/data/mock";
import { fetchAccounts, fetchCommitments, fetchInvoices } from "@/lib/portalApi";
import { useAuth } from "@/auth/AuthProvider";
import type { PortalAccount, PortalCommitment, PortalInvoice } from "@/types/portal";

export interface PortalData {
  accounts: PortalAccount[];
  invoices: PortalInvoice[];
  commitments: PortalCommitment[];
  totalPending: number;
  /** Pending promises that cover the whole account balance. */
  upcomingCommitments: PortalCommitment[];
  /** Pending promises for part of the balance, i.e. instalments. */
  activePlans: PortalCommitment[];
  recentlyResolved: PortalInvoice[];
  loading: boolean;
  error: string | null;
  isMock: boolean;
  refresh: () => Promise<void>;
}

export function usePortalData(): PortalData {
  const { useMockData } = useAuth();
  const [accounts, setAccounts] = useState<PortalAccount[]>([]);
  const [invoices, setInvoices] = useState<PortalInvoice[]>([]);
  const [commitments, setCommitments] = useState<PortalCommitment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (useMockData) {
        setAccounts(mockAccounts);
        setInvoices(mockInvoices);
        setCommitments(mockCommitments);
      } else {
        const [a, i, c] = await Promise.all([fetchAccounts(), fetchInvoices(), fetchCommitments()]);
        setAccounts(a);
        setInvoices(i);
        setCommitments(c);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your account");
    } finally {
      setLoading(false);
    }
  }, [useMockData]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const derived = useMemo(() => {
    const outstandingById = new Map(accounts.map((a) => [a.customer_id, a.total_outstanding]));
    const pending = commitments.filter((c) => c.status === "pending" && c.promised_date);
    const isPartial = (c: PortalCommitment) =>
      c.promised_amount != null && c.promised_amount < (outstandingById.get(c.customer_id) ?? 0);
    const byDate = (a: PortalCommitment, b: PortalCommitment) => a.promised_date!.localeCompare(b.promised_date!);
    return {
      totalPending: accounts.reduce((sum, a) => sum + a.total_outstanding, 0),
      upcomingCommitments: pending.filter((c) => !isPartial(c)).sort(byDate),
      activePlans: pending.filter(isPartial).sort(byDate),
      recentlyResolved: invoices.filter((i) => i.status === "Paid").slice(0, 8),
    };
  }, [accounts, invoices, commitments]);

  return { accounts, invoices, commitments, ...derived, loading, error, isMock: useMockData, refresh };
}
