-- Vendor app write paths.
--
-- Vendors only have SELECT policies, and the existing write functions (fn_add_invoice,
-- fn_save_commitment) are service_role only because they take a tenant / customer id on
-- trust. These wrappers derive the tenant from the caller's JWT (fn_my_tenant_id), check the
-- caller may write for it, validate input, and then delegate to the existing functions, so
-- the business rules (plan limits, promise tracking, risk recalculation) stay in one place.
-- No tables or policies change.

-- The caller's tenant, if they may write to it: the owner, or an active 'member'
-- (viewers stay read-only). Suspended tenants can't write.
create or replace function public.fn_vendor_writable_tenant()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := fn_my_tenant_id();
begin
  if v_tenant is null then
    raise exception 'NOT_A_VENDOR' using errcode = '42501';
  end if;
  if exists (select 1 from tenants where id = v_tenant and is_suspended) then
    raise exception 'TENANT_SUSPENDED' using errcode = '42501';
  end if;
  if not exists (select 1 from tenants where id = v_tenant and auth_user_id = auth.uid())
     and not exists (
       select 1 from tenant_members
       where tenant_id = v_tenant and user_id = auth.uid() and status = 'active' and role = 'member'
     ) then
    raise exception 'READ_ONLY_MEMBER' using errcode = '42501';
  end if;
  return v_tenant;
end;
$$;

-- Quick manual override: stop AI calls to a debtor until a date (fn_recovery_plan skips
-- customers whose active_promise_date is in the future). p_until = null resumes calls.
create or replace function public.fn_vendor_pause_ai(p_customer_id uuid, p_until date)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := fn_vendor_writable_tenant();
begin
  if p_until is not null and (p_until <= current_date or p_until > current_date + 60) then
    raise exception 'INVALID_PAUSE_DATE' using errcode = '22023';
  end if;

  update customers
  set active_promise_date = p_until
  where id = p_customer_id and tenant_id = v_tenant;

  if not found then
    raise exception 'CUSTOMER_NOT_FOUND' using errcode = 'P0002';
  end if;

  return jsonb_build_object('customerId', p_customer_id, 'activePromiseDate', p_until);
end;
$$;

-- Log what came out of a call: a promise, a part-payment received, a dispute...
-- 'Paid' / 'Partial Payment' settle invoices oldest-first inside fn_save_commitment.
create or replace function public.fn_vendor_log_interaction(
  p_customer_id uuid,
  p_interaction_type text,
  p_promised_amount numeric,
  p_promised_date date,
  p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := fn_vendor_writable_tenant();
begin
  if not exists (select 1 from customers where id = p_customer_id and tenant_id = v_tenant) then
    raise exception 'CUSTOMER_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_interaction_type not in ('Promise to Pay', 'Partial Payment', 'Dispute', 'No Response', 'Paid', 'Other') then
    raise exception 'INVALID_INTERACTION' using errcode = '22023';
  end if;
  if p_promised_amount is not null and (p_promised_amount <= 0 or p_promised_amount > 100000000) then
    raise exception 'INVALID_AMOUNT' using errcode = '22023';
  end if;
  if p_interaction_type = 'Promise to Pay'
     and (p_promised_date is null or p_promised_date < current_date or p_promised_date > current_date + 90) then
    raise exception 'INVALID_PROMISE_DATE' using errcode = '22023';
  end if;
  if char_length(coalesce(p_notes, '')) > 2000 then
    raise exception 'NOTES_TOO_LONG' using errcode = '22023';
  end if;

  return fn_save_commitment(p_customer_id, p_interaction_type, p_promised_amount, p_promised_date, nullif(trim(p_notes), ''), null);
end;
$$;

-- Add an invoice (creating or updating the debtor by mobile number). Plan limits are
-- enforced by fn_add_invoice, which raises PLAN_LIMIT.
create or replace function public.fn_vendor_add_invoice(
  p_name text,
  p_phone text,
  p_email text,
  p_category text,
  p_invoice_no text,
  p_amount numeric,
  p_due_date date,
  p_invoice_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := fn_vendor_writable_tenant();
begin
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 120 then
    raise exception 'INVALID_NAME' using errcode = '22023';
  end if;
  if coalesce(p_phone, '') !~ '^[6-9][0-9]{9}$' then
    raise exception 'INVALID_PHONE' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_invoice_no, ''))) not between 1 and 60 then
    raise exception 'INVALID_INVOICE_NO' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000000 then
    raise exception 'INVALID_AMOUNT' using errcode = '22023';
  end if;
  if p_due_date is null then
    raise exception 'INVALID_DUE_DATE' using errcode = '22023';
  end if;

  return fn_add_invoice(v_tenant, trim(p_name), p_phone, trim(coalesce(p_email, '')), trim(coalesce(p_category, '')),
                        trim(p_invoice_no), p_amount, p_due_date, p_invoice_date);
end;
$$;

revoke all on function public.fn_vendor_writable_tenant() from public, anon;
revoke all on function public.fn_vendor_pause_ai(uuid, date) from public, anon;
revoke all on function public.fn_vendor_log_interaction(uuid, text, numeric, date, text) from public, anon;
revoke all on function public.fn_vendor_add_invoice(text, text, text, text, text, numeric, date, date) from public, anon;

grant execute on function public.fn_vendor_pause_ai(uuid, date) to authenticated;
grant execute on function public.fn_vendor_log_interaction(uuid, text, numeric, date, text) to authenticated;
grant execute on function public.fn_vendor_add_invoice(text, text, text, text, text, numeric, date, date) to authenticated;
