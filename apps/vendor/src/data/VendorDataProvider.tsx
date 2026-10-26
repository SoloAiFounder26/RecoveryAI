import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { mockSnapshot } from "@/data/mock";
import { startOfToday, toISODate } from "@/lib/format";
import { computeMetrics, type DashboardMetrics } from "@/lib/metrics";
import {
  addInvoice as apiAddInvoice,
  fetchDashboard,
  logInteraction as apiLogInteraction,
  pauseAiCalls as apiPauseAiCalls,
  requestRecoveryCall,
  type InteractionInput,
  type NewInvoiceInput,
  type RecoveryCallResult,
} from "@/lib/vendorApi";
import type { DashboardSnapshot } from "@/types/vendor";

/** Poll while the app is open so the dispatch feed and KPIs stay live. */
const POLL_MS = 30_000;

interface VendorData {
  snapshot: DashboardSnapshot | null;
  metrics: DashboardMetrics | null;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
  /** True on the demo login / unconfigured preview: writes only change local sample data. */
  isSample: boolean;
  refresh: () => Promise<void>;
  requestCall: (customerId: string, invoiceId?: string) => Promise<RecoveryCallResult>;
  pauseAi: (customerId: string, until: string | null) => Promise<void>;
  logInteraction: (input: InteractionInput) => Promise<void>;
  addInvoice: (input: NewInvoiceInput) => Promise<void>;
}

const Ctx = createContext<VendorData | null>(null);

/** One load of the tenant's book, shared by every tab, refreshed in the background. */
export function VendorDataProvider({ children }: { children: ReactNode }) {
  const { useMockData, status } = useAuth();
  const active = status === "ready";
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const next = useMockData ? null : await fetchDashboard();
      setSnapshot((cur) => next ?? cur ?? { ...mockSnapshot, fetchedAt: new Date().toISOString() });
      setError(null);
    } catch (e) {
      // Keep showing the last good data on a failed background refresh.
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      inFlight.current = false;
    }
  }, [useMockData]);

  useEffect(() => {
    setSnapshot(null);
    setError(null);
    if (active) load();
  }, [active, load]);

  useEffect(() => {
    if (useMockData || !active) return;
    let timer: ReturnType<typeof setInterval> | null = setInterval(load, POLL_MS);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") {
        load();
        timer ??= setInterval(load, POLL_MS);
      } else if (timer) {
        clearInterval(timer);
        timer = null;
      }
    });
    return () => {
      if (timer) clearInterval(timer);
      sub.remove();
    };
  }, [active, load, useMockData]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const requestCall = useCallback(
    async (customerId: string, invoiceId?: string): Promise<RecoveryCallResult> => {
      if (useMockData) {
        await delay(1100);
        return { status: "queued", message: "AI call queued · sample" };
      }
      return requestRecoveryCall({ customerId, invoiceId });
    },
    [useMockData],
  );

  const pauseAi = useCallback(
    async (customerId: string, until: string | null) => {
      if (useMockData) {
        await delay(400);
        setSnapshot((s) => s && { ...s, customers: s.customers.map((c) => (c.id === customerId ? { ...c, active_promise_date: until } : c)) });
        return;
      }
      await apiPauseAiCalls(customerId, until);
      await load();
    },
    [load, useMockData],
  );

  const logInteraction = useCallback(
    async (input: InteractionInput) => {
      if (useMockData) {
        await delay(400);
        setSnapshot((s) => s && applyMockInteraction(s, input));
        return;
      }
      await apiLogInteraction(input);
      await load();
    },
    [load, useMockData],
  );

  const addInvoice = useCallback(
    async (input: NewInvoiceInput) => {
      if (useMockData) {
        await delay(400);
        setSnapshot((s) => s && applyMockInvoice(s, input));
        return;
      }
      await apiAddInvoice(input);
      await load();
    },
    [load, useMockData],
  );

  const metrics = useMemo(() => (snapshot ? computeMetrics(snapshot) : null), [snapshot]);

  const value = useMemo(
    () => ({
      snapshot,
      metrics,
      error,
      loading: !snapshot && !error,
      refreshing,
      isSample: useMockData,
      refresh,
      requestCall,
      pauseAi,
      logInteraction,
      addInvoice,
    }),
    [snapshot, metrics, error, refreshing, useMockData, refresh, requestCall, pauseAi, logInteraction, addInvoice],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useVendorData() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useVendorData must be used inside <VendorDataProvider>");
  return ctx;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
let mockSeq = 0;
const mockId = (p: string) => `${p}-local-${++mockSeq}`;

// Sample-mode stand-ins for fn_save_commitment / fn_add_invoice, so the demo build behaves.
function applyMockInteraction(s: DashboardSnapshot, input: InteractionInput): DashboardSnapshot {
  const settles = input.type === "Paid" || input.type === "Partial Payment";
  let remaining = settles ? (input.amount ?? Infinity) : 0;
  const invoices = [...s.invoices]
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .map((inv) => {
      if (inv.customer_id !== input.customerId || inv.status === "Paid" || remaining <= 0) return inv;
      if (remaining >= inv.amount) {
        remaining -= inv.amount;
        return { ...inv, status: "Paid" as const };
      }
      const left = inv.amount - remaining;
      remaining = 0;
      return { ...inv, amount: left };
    });
  const outstanding = invoices.filter((i) => i.customer_id === input.customerId && i.status !== "Paid").reduce((t, i) => t + i.amount, 0);
  return {
    ...s,
    invoices,
    customers: s.customers.map((c) =>
      c.id !== input.customerId
        ? c
        : {
            ...c,
            total_outstanding: outstanding,
            active_promise_date: input.type === "Paid" ? null : (input.date ?? c.active_promise_date),
          },
    ),
    commitments: [
      {
        id: mockId("m"),
        customer_id: input.customerId,
        interaction_type: input.type,
        promised_amount: input.amount,
        promised_date: input.date,
        notes: input.notes || null,
        status: input.type === "Paid" ? "kept" : "pending",
        audio_url: null,
        created_at: new Date().toISOString(),
      },
      ...s.commitments,
    ],
  };
}

function applyMockInvoice(s: DashboardSnapshot, input: NewInvoiceInput): DashboardSnapshot {
  let customer = s.customers.find((c) => c.phone === input.phone);
  const customers = [...s.customers];
  if (!customer) {
    customer = {
      id: mockId("c"),
      name: input.name,
      phone: input.phone,
      category: input.category || null,
      total_outstanding: 0,
      overdue_days: 0,
      risk_level: "Low",
      ai_risk_score: 30,
      ai_insight: null,
      broken_promises_count: 0,
      active_promise_date: null,
    };
    customers.push(customer);
  }
  const cid = customer.id;
  return {
    ...s,
    customers: customers.map((c) => (c.id === cid ? { ...c, total_outstanding: c.total_outstanding + input.amount } : c)),
    invoices: [
      ...s.invoices,
      {
        id: mockId("i"),
        customer_id: cid,
        invoice_no: input.invoiceNo,
        amount: input.amount,
        due_date: input.dueDate,
        invoice_date: input.invoiceDate,
        status: input.dueDate < toISODate(startOfToday()) ? "Overdue" : "Pending",
        created_at: new Date().toISOString(),
      },
    ],
  };
}
