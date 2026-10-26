import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { mockSnapshot } from "@/data/mock";
import { addDays, startOfToday, toISODate } from "@/lib/format";
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
import { buildLocalDraft } from "@/lib/drafts";
import { PLANS, type Channel, type MemberRole, type PlanSpec, type Tone } from "@/lib/plans";
import { stageForDaysOverdue } from "@/lib/cadence";
import { daysBetween } from "@/lib/interest";
import type { Lang } from "@/lib/templates";
import * as web from "@/lib/webApi";
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
  /** The caller's seat: owner, or a member / viewer invited by the owner. */
  role: MemberRole;
  plan: PlanSpec | null;
  getDraft: (invoiceId: string, opts: { tone: Tone; channel: Channel; lang: Lang }) => Promise<web.DraftResult>;
  markReminderSent: (invoiceId: string, channel: Channel) => Promise<void>;
  transcribe: (uri: string, mimeType: string) => Promise<web.VoiceActionResult>;
  importCustomers: (customers: web.ImportCustomerPayload[]) => Promise<web.ImportSummary>;
  updateProfile: (patch: web.ProfilePatch) => Promise<void>;
  loadTeam: () => Promise<web.TeamResult>;
  inviteMember: (email: string, role: "member" | "viewer") => Promise<web.TeamMember>;
  removeMember: (id: string) => Promise<void>;
  loadSupport: () => Promise<{ priority: boolean; requests: web.SupportRequest[] }>;
  sendSupport: (subject: string, message: string) => Promise<web.SupportRequest>;
}

const Ctx = createContext<VendorData | null>(null);

/** One load of the tenant's book, shared by every tab, refreshed in the background. */
export function VendorDataProvider({ children }: { children: ReactNode }) {
  const { useMockData, status, session } = useAuth();
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

  // Reads that a later write must see; the snapshot itself is state and can be a render behind.
  const snapRef = useRef(snapshot);
  snapRef.current = snapshot;
  const [mockSupport, setMockSupport] = useState<web.SupportRequest[]>(MOCK_SUPPORT);
  const mockSupportRef = useRef(mockSupport);
  mockSupportRef.current = mockSupport;

  const getDraft = useCallback(
    async (invoiceId: string, opts: { tone: Tone; channel: Channel; lang: Lang }) => {
      if (!useMockData) return web.fetchDraft({ invoiceId, ...opts });
      const s = snapRef.current;
      const invoice = s?.invoices.find((i) => i.id === invoiceId);
      const customer = s?.customers.find((c) => c.id === invoice?.customer_id);
      if (!s?.tenant || !invoice || !customer) throw new Error("Invoice not found.");
      if (invoice.status === "Paid") throw new Error("This invoice is already paid.");
      return buildLocalDraft(s.tenant, customer, invoice, opts);
    },
    [useMockData],
  );

  const markReminderSent = useCallback(
    async (invoiceId: string, channel: Channel) => {
      if (!useMockData) {
        await web.markReminderSent(invoiceId, channel);
        await load();
        return;
      }
      await delay(300);
      setSnapshot((s) => {
        const inv = s?.invoices.find((i) => i.id === invoiceId);
        const stage = inv ? stageForDaysOverdue(daysBetween(inv.due_date, toISODate(startOfToday()))) : null;
        if (!s || !stage) return s;
        return {
          ...s,
          reminders: [{ id: mockId("r"), invoice_id: invoiceId, stage, channel, created_by: "demo", created_at: new Date().toISOString() }, ...s.reminders],
        };
      });
    },
    [load, useMockData],
  );

  const transcribe = useCallback(
    async (uri: string, mimeType: string) => {
      if (!useMockData) return web.transcribeVoiceNote(uri, mimeType);
      await delay(1500);
      return {
        transcript: "Sharma ji se baat hui, bole parso tak pachaas hazar bhej denge, baaki agle mahine.",
        customer_name: null,
        promised_amount: 50000,
        promised_date: toISODate(addDays(startOfToday(), 2)),
        interaction_type: "Promise to Pay" as const,
        notes: "Promised ₹50,000 in 2 days; balance next month. (Sample transcription)",
      };
    },
    [useMockData],
  );

  const importCustomers = useCallback(
    async (rows: web.ImportCustomerPayload[]) => {
      if (!useMockData) {
        const summary = await web.importCustomers(rows);
        await load();
        return summary;
      }
      await delay(800);
      let inserted = 0;
      let total = 0;
      for (const c of rows) {
        for (const inv of c.invoices) {
          total += inv.amount;
          inserted++;
          setSnapshot((s) =>
            s &&
            applyMockInvoice(s, { name: c.name, phone: c.phone, email: "", category: c.category ?? "", invoiceNo: inv.invoiceNo, amount: inv.amount, dueDate: inv.dueDate, invoiceDate: null }),
          );
        }
      }
      return { insertedCustomers: rows.length, insertedInvoices: inserted, totalOutstanding: total };
    },
    [load, useMockData],
  );

  const updateProfile = useCallback(
    async (patch: web.ProfilePatch) => {
      if (!useMockData) {
        await web.updateProfile(patch);
        await load();
        return;
      }
      await delay(400);
      setSnapshot((s) =>
        !s?.tenant
          ? s
          : {
            ...s,
            tenant: {
              ...s.tenant,
              ...(patch.upiId !== undefined && { upi_id: patch.upiId }),
              ...(patch.bankDetails !== undefined && { bank_details: patch.bankDetails }),
              ...(patch.udyamNumber !== undefined && { udyam_number: patch.udyamNumber }),
              ...(patch.udyamCategory !== undefined && { udyam_category: patch.udyamCategory }),
              ...(patch.udyamRegisteredOn !== undefined && { udyam_registered_on: patch.udyamRegisteredOn }),
            },
          },
      );
    },
    [load, useMockData],
  );

  const loadTeam = useCallback(async (): Promise<web.TeamResult> => {
    if (!useMockData) return web.fetchTeam();
    const s = snapRef.current;
    return {
      seatLimit: s?.tenant ? PLANS[s.tenant.plan].seats : 1,
      canManage: true,
      members: (s?.members ?? []).map((m) => (m.status === "invited" ? { ...m, inviteCode: "DEMO-7KQ4-XM2P" } : m)),
    };
  }, [useMockData]);

  const inviteMember = useCallback(
    async (email: string, role: "member" | "viewer") => {
      if (!useMockData) {
        const created = await web.inviteMember(email, role);
        await load();
        return created;
      }
      await delay(400);
      const s = snapRef.current;
      const seats = s?.tenant ? PLANS[s.tenant.plan].seats : 1;
      if (seats <= 1) throw new Error("Team seats are available on the MSME Growth plan. Contact us to upgrade.");
      if (1 + (s?.members.length ?? 0) >= seats) throw new Error(`Your plan includes ${seats} seats and all are in use.`);
      const member = { id: mockId("tm"), email, role, status: "invited" as const, invited_at: new Date().toISOString() };
      setSnapshot((cur) => cur && { ...cur, members: [...cur.members, member] });
      return { ...member, inviteCode: "DEMO-7KQ4-XM2P" };
    },
    [load, useMockData],
  );

  const removeMember = useCallback(
    async (id: string) => {
      if (!useMockData) {
        await web.removeMember(id);
        await load();
        return;
      }
      await delay(300);
      setSnapshot((s) => s && { ...s, members: s.members.filter((m) => m.id !== id) });
    },
    [load, useMockData],
  );

  const loadSupport = useCallback(async () => {
    if (!useMockData) return web.fetchSupport();
    const s = snapRef.current;
    return { priority: s?.tenant ? PLANS[s.tenant.plan].prioritySupport : false, requests: mockSupportRef.current };
  }, [useMockData]);

  const sendSupport = useCallback(
    async (subject: string, message: string) => {
      if (!useMockData) return web.sendSupportRequest(subject, message);
      await delay(500);
      const created: web.SupportRequest = {
        id: mockId("sr"),
        subject,
        message,
        priority: true,
        status: "open",
        created_at: new Date().toISOString(),
        support_replies: [],
      };
      setMockSupport((list) => [created, ...list]);
      return created;
    },
    [useMockData],
  );

  const role: MemberRole = useMemo(() => {
    if (useMockData || !snapshot?.tenant) return "owner";
    if (snapshot.tenant.auth_user_id === session?.user.id) return "owner";
    const me = snapshot.members.find((m) => m.email.toLowerCase() === session?.user.email?.toLowerCase());
    return me?.role ?? "viewer";
  }, [useMockData, snapshot, session]);

  const plan = snapshot?.tenant ? PLANS[snapshot.tenant.plan] : null;

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
      role,
      plan,
      getDraft,
      markReminderSent,
      transcribe,
      importCustomers,
      updateProfile,
      loadTeam,
      inviteMember,
      removeMember,
      loadSupport,
      sendSupport,
    }),
    [
      snapshot,
      metrics,
      error,
      refreshing,
      useMockData,
      refresh,
      requestCall,
      pauseAi,
      logInteraction,
      addInvoice,
      role,
      plan,
      getDraft,
      markReminderSent,
      transcribe,
      importCustomers,
      updateProfile,
      loadTeam,
      inviteMember,
      removeMember,
      loadSupport,
      sendSupport,
    ],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useVendorData() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useVendorData must be used inside <VendorDataProvider>");
  return ctx;
}

const MOCK_SUPPORT: web.SupportRequest[] = [
  {
    id: "sr-demo-1",
    subject: "How do I change my UPI ID?",
    message: "I opened a new current account and want reminders to carry the new UPI ID.",
    priority: true,
    status: "in_progress",
    created_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    support_replies: [
      {
        id: "srr-demo-1",
        message: "Open Account → Business profile, edit the UPI ID and save. New drafts pick it up straight away.",
        created_at: new Date(Date.now() - 2 * 86_400_000 + 60_000).toISOString(),
        is_ai: true,
      },
    ],
  },
];

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
      email: input.email || null,
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
