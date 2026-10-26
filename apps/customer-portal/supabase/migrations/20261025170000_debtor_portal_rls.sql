-- =============================================================================
-- RecoveryAI Customer / Debtor Portal: data isolation
-- =============================================================================
-- Who is a debtor?
--   Anyone who signs in to the portal with Supabase phone OTP. Their identity is
--   auth.users.phone, which Supabase only sets after the OTP is verified. A debtor
--   is linked to every `customers` row (across all vendors/tenants) whose phone
--   is the same Indian mobile number.
--
-- What can a debtor do?
--   * SELECT their own invoices directly (RLS policy below).
--   * Read their accounts and promise history through SECURITY DEFINER RPCs that
--     return only debtor-safe columns. They never get a policy on `customers`,
--     `tenants` or `commitments`, because those rows carry vendor-internal data
--     (ai_risk_score, ai_insight, collector notes, call recordings, bank details).
--   * Log "I will pay on <date>" through fn_portal_set_commitment, which pauses
--     AI recovery calls by setting customers.active_promise_date.
--   * Nothing else: no INSERT/UPDATE/DELETE policies exist for debtors.
--
-- Existing vendor policies (tenant_id = fn_my_tenant_id()) are untouched;
-- Postgres ORs permissive policies, so vendors keep exactly their current access.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Phone identity helpers
-- -----------------------------------------------------------------------------

-- Canonical 10-digit Indian mobile, or NULL if the input isn't one.
-- Accepts "9812345678", "+91 98123 45678", "09812345678", "91-9812345678".
-- Anything else (landlines, foreign numbers) returns NULL and can never match,
-- so a +1 number ending in the same 10 digits can't claim an Indian debtor.
create or replace function public.fn_normalize_in_mobile(p_phone text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when d ~ '^[6-9][0-9]{9}$' then d
    when d ~ '^(91|0)[6-9][0-9]{9}$' then right(d, 10)
    else null
  end
  from (select pg_catalog.regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') as d) s;
$$;

-- The signed-in user's OTP-verified mobile, or NULL.
-- Reads auth.users (not the JWT) so a revoked/changed phone takes effect at once.
create or replace function public.fn_debtor_phone()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select public.fn_normalize_in_mobile(u.phone)
  from auth.users u
  where u.id = auth.uid()
    and u.phone is not null
    and u.phone_confirmed_at is not null
    and u.phone ~ '^\+?91[6-9][0-9]{9}$';
$$;

-- All customer ids (one per vendor) that belong to the signed-in debtor.
-- Suspended vendors are hidden from their debtors as well.
create or replace function public.fn_my_debtor_customer_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
  from public.customers c
  join public.tenants t on t.id = c.tenant_id
  where public.fn_debtor_phone() is not null
    and public.fn_normalize_in_mobile(c.phone) = public.fn_debtor_phone()
    and not t.is_suspended;
$$;

-- Keeps the phone lookup above an index scan as the customer table grows.
create index if not exists customers_debtor_mobile_idx
  on public.customers (public.fn_normalize_in_mobile(phone));

-- -----------------------------------------------------------------------------
-- 2. Row Level Security
-- -----------------------------------------------------------------------------

alter table public.invoices enable row level security;
alter table public.customers enable row level security;
alter table public.commitments enable row level security;
alter table public.tenants enable row level security;

-- Debtors read only invoices raised against their own customer records.
drop policy if exists "Debtor reads own invoices" on public.invoices;
create policy "Debtor reads own invoices"
  on public.invoices
  for select
  to authenticated
  using (customer_id in (select public.fn_my_debtor_customer_ids()));

-- Deliberately NO debtor policies on customers / tenants / commitments.
-- Debtor reads go through the RPCs below, which project safe columns only.

-- -----------------------------------------------------------------------------
-- 3. Read RPCs (debtor-safe projections)
-- -----------------------------------------------------------------------------

create or replace function public.fn_portal_accounts()
returns table (
  customer_id uuid,
  customer_name text,
  vendor_name text,
  vendor_upi_id text,
  total_outstanding numeric,
  overdue_days integer,
  active_promise_date date
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name, t.business_name, t.upi_id, c.total_outstanding, c.overdue_days, c.active_promise_date
  from public.customers c
  join public.tenants t on t.id = c.tenant_id
  where c.id in (select public.fn_my_debtor_customer_ids())
  order by c.total_outstanding desc;
$$;

-- Promise history without collector notes or call-recording URLs.
create or replace function public.fn_portal_commitments()
returns table (
  id uuid,
  customer_id uuid,
  interaction_type text,
  promised_amount numeric,
  promised_date date,
  status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.customer_id, m.interaction_type, m.promised_amount, m.promised_date, m.status, m.created_at
  from public.commitments m
  where m.customer_id in (select public.fn_my_debtor_customer_ids())
  order by m.created_at desc
  limit 200;
$$;

-- -----------------------------------------------------------------------------
-- 4. Write RPC: "I will pay on <date>"  (pauses AI recovery calls)
-- -----------------------------------------------------------------------------
-- fn_recovery_plan only queues customers whose active_promise_date is NULL,
-- today, or in the past. Setting a future date therefore removes the account
-- from the AI call queue until that day, and it re-enters automatically if the
-- date passes unpaid (fn_save_commitment then marks the promise broken).
--
-- Guardrails so the pause can't be abused:
--   * date must be 1..30 days ahead (India time), matching the app's slider
--   * amount, if given, must be > 0 and <= the outstanding balance
--   * at most 2 self-service commitments per account in any 7 days
--   * always logged as 'Promise to Pay' (never 'Partial Payment'/'Paid', which
--     fn_save_commitment would treat as money received)
create or replace function public.fn_portal_set_commitment(
  p_customer_id uuid,
  p_promised_date date,
  p_promised_amount numeric default null,
  p_note text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_today date := (pg_catalog.now() at time zone 'Asia/Kolkata')::date;
  v_outstanding numeric;
  v_recent integer;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  if p_customer_id is null
     or p_customer_id not in (select public.fn_my_debtor_customer_ids()) then
    raise exception 'account not found' using errcode = '42501';
  end if;

  if p_promised_date is null
     or p_promised_date < v_today + 1
     or p_promised_date > v_today + 30 then
    raise exception 'promised date must be between % and %', v_today + 1, v_today + 30
      using errcode = '22023';
  end if;

  select c.total_outstanding into v_outstanding
  from public.customers c
  where c.id = p_customer_id
  for update;

  if coalesce(v_outstanding, 0) <= 0 then
    raise exception 'nothing is outstanding on this account' using errcode = '22023';
  end if;

  if p_promised_amount is not null
     and (p_promised_amount <= 0 or p_promised_amount > v_outstanding) then
    raise exception 'amount must be between 1 and %', v_outstanding using errcode = '22023';
  end if;

  select count(*) into v_recent
  from public.commitments m
  where m.customer_id = p_customer_id
    and m.notes like '[Customer portal]%'
    and m.created_at > pg_catalog.now() - interval '7 days';

  if v_recent >= 2 then
    raise exception 'you have already updated this commitment twice this week; please contact the vendor'
      using errcode = 'P0001';
  end if;

  v_result := public.fn_save_commitment(
    p_customer_id,
    'Promise to Pay',
    coalesce(p_promised_amount, v_outstanding),
    p_promised_date,
    '[Customer portal] ' || coalesce(left(p_note, 280), 'Debtor committed a payment date'),
    null
  );

  return jsonb_build_object(
    'commitmentId', v_result ->> 'commitmentId',
    'activePromiseDate', v_result ->> 'activePromiseDate'
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Grants: signed-in users only, never anon
-- -----------------------------------------------------------------------------
revoke all on function public.fn_debtor_phone() from public, anon;
revoke all on function public.fn_my_debtor_customer_ids() from public, anon;
revoke all on function public.fn_portal_accounts() from public, anon;
revoke all on function public.fn_portal_commitments() from public, anon;
revoke all on function public.fn_portal_set_commitment(uuid, date, numeric, text) from public, anon;

grant execute on function public.fn_normalize_in_mobile(text) to authenticated;
grant execute on function public.fn_debtor_phone() to authenticated;
grant execute on function public.fn_my_debtor_customer_ids() to authenticated;
grant execute on function public.fn_portal_accounts() to authenticated;
grant execute on function public.fn_portal_commitments() to authenticated;
grant execute on function public.fn_portal_set_commitment(uuid, date, numeric, text) to authenticated;
