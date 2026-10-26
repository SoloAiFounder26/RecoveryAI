import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { mockSnapshot } from "@/data/mock";
import { computeMetrics } from "@/lib/metrics";
import { fetchDashboard } from "@/lib/vendorApi";
import type { DashboardSnapshot } from "@/types/vendor";

export function useVendorDashboard() {
  const { useMockData } = useAuth();
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setSnapshot(useMockData ? { ...mockSnapshot, fetchedAt: new Date().toISOString() } : await fetchDashboard());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [useMockData]);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const metrics = useMemo(() => (snapshot ? computeMetrics(snapshot) : null), [snapshot]);

  return { snapshot, metrics, error, loading: !snapshot && !error, refreshing, refresh, isSample: useMockData };
}
