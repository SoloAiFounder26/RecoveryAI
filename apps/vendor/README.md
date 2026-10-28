# RecoveryAI Business: Vendor App

The vendor / business-owner app for RecoveryAI. A business signs in with its RecoveryAI web
account and sees every rupee it is owed: total receivables, aging, DSO, the AI's call-first
queue, and an overdue matrix with swipe-to-trigger AI recovery calls. Dark, CRED-style UI.

It reads the live Supabase project (`recovery-ai`) as the signed-in vendor. No new tables,
functions or policies: every query goes through the existing `Owner reads own ...` RLS
policies, keyed on `fn_my_tenant_id()`.

Sibling app: `apps/customer-portal` (the debtor side). Theme, secure storage, formatting and
the rolling counter are shared patterns with it.

## Stack

Expo SDK 57 · Expo Router · TypeScript · NativeWind 4 · Reanimated 4 + Worklets ·
Gesture Handler · expo-haptics / blur / secure-store / local-authentication / screen-capture ·
Supabase JS.

> The brief asked for SDK 51+ and Reanimated v3. SDK 57 is current and ships Reanimated 4,
> which keeps the v3 API (`useSharedValue`, `withSpring`, `useAnimatedStyle`, gestures). The
> only rename used is `scheduleOnRN` from `react-native-worklets` (was `runOnJS`).

## Setup

```bash
cd apps/vendor
npx create-expo-app@latest . --template blank-typescript   # already done; listed for reference
npx expo install expo-router expo-haptics expo-blur expo-linear-gradient expo-secure-store \
  expo-local-authentication expo-screen-capture expo-status-bar expo-font expo-constants expo-linking \
  react-native-reanimated react-native-worklets react-native-gesture-handler react-native-svg \
  react-native-safe-area-context react-native-screens @gorhom/bottom-sheet react-native-web react-dom
npx expo install expo-audio expo-asset expo-clipboard expo-document-picker expo-file-system
npm i nativewind tailwindcss@^3.4 @supabase/supabase-js react-native-url-polyfill xlsx

cp .env.example .env.local    # Supabase URL + publishable key, EXPO_PUBLIC_WEB_API_URL (default https://app.zaravito.com)
npm start                     # Expo Go / dev client
npm run build:apk             # test APK via EAS (preview profile has a demo login)
```

Without `.env.local` the app runs in preview mode on sample data.

## Structure

```
apps/vendor/
├── app.json / eas.json        # bundle ids, Face ID string; preview APK profile with demo login
├── supabase/migrations/
│   └── 20261026100000_vendor_app_rpcs.sql   # fn_vendor_* write RPCs (pause AI, log outcome, add invoice)
└── src/
    ├── app/                         # Expo Router routes only
    │   ├── _layout.tsx              # providers, BiometricShield, VendorDataProvider, route guards
    │   ├── login.tsx                # Supabase Auth: email + password, or email OTP
    │   ├── (tabs)/                  # Home · Customers · Reminders · Settings (frosted tab bar)
    │   ├── client/[id].tsx          # client detail
    │   ├── signup.tsx               # new business / invited accountant, via /api/auth/signup
    │   ├── reminder/[customerId].tsx  # reminder draft (tone, channel, language, UPI link, mark sent)
    │   ├── analytics.tsx  import.tsx  profile.tsx  team.tsx  help.tsx
    │   ├── activity.tsx             # activity log
    │   └── add-invoice.tsx          # modal
    ├── screens/
    │   ├── VendorDashboardScreen.tsx   # Command Vault
    │   ├── DebtorsScreen.tsx           # invoice matrix by aging bucket + clients view
    │   ├── ClientDetailScreen.tsx      # ledger, pay score, transcripts, recordings, overrides
    │   ├── DispatchHubScreen.tsx       # AI call queue + live call / reminder feed
    │   ├── AccountScreen.tsx           # plan + quotas, organisation, team, security
    │   ├── ActivityLogScreen.tsx       # timestamped log
    │   ├── ReminderScreen.tsx  AnalyticsScreen.tsx  ImportScreen.tsx
    │   ├── ProfileScreen.tsx  TeamScreen.tsx  HelpScreen.tsx
    │   └── AddInvoiceScreen.tsx
    ├── components/
    │   ├── BiometricShield.tsx  SwipeToRecoverSlider.tsx  DebtorCard.tsx
    │   ├── ClientSheets.tsx (pause AI / log outcome)  CallRecordingPlayer.tsx  Sheet.tsx
    │   ├── DsoGauge.tsx  GlassCard.tsx  RollingRupeeCounter.tsx  TabBar.tsx  ui.tsx  icons.tsx
    ├── data/VendorDataProvider.tsx  # one shared load, 30 s polling, write actions (+ sample-mode stand-ins)
    ├── data/mock.ts
    ├── lib/                         # vendorApi (Supabase), webApi (app.zaravito.com/api), metrics, analytics, drafts
    │                                # plans / templates / cadence / interest / importParser: ported from the web app
    ├── theme/tokens.ts
    └── types/vendor.ts              # row types matching the live schema, plan limits/prices
```

## How the numbers are derived

| Card | Source |
| --- | --- |
| Total pending receivables | Sum of `invoices.amount` where `status <> 'Paid'` |
| Aging buckets | Days past `invoices.due_date` (not-yet-due counts in 0-30) |
| DSO | Open receivables ÷ invoices raised in the last 90 days × 90 (`invoice_date`, else `created_at`) |
| Recovered this month | `commitments` of type `Paid` / `Partial Payment` logged this month |
| Call outcomes | All `commitments` logged this month |
| WhatsApp reminders | `reminder_events` with `channel = 'whatsapp'` this month |
| Needs action now | `fn_recovery_plan(tenant_id)` |
| "AI paused" tag | `customers.active_promise_date` after today (the plan skips them) |

## Writes

Vendors only have SELECT policies, so writes go through `supabase/migrations/20261026100000_vendor_app_rpcs.sql`:
`fn_vendor_pause_ai`, `fn_vendor_log_interaction` and `fn_vendor_add_invoice`. Each derives the tenant from the JWT,
blocks viewers and suspended tenants, validates input, then calls the existing `fn_save_commitment` / `fn_add_invoice`.
Until that migration is applied, those buttons show "This action needs a backend update that isn't live yet".

## Features that call the web app's API

The rest of the web app's features need the service role or Gemini, which live in the Next.js app
(`SoloAiFounder26/recovery-ai`). `src/lib/webApi.ts` calls those routes with the signed-in user's Supabase
access token as `Authorization: Bearer`, which the server accepts from recovery-ai PR #25 onward:

| Feature | Route |
| --- | --- |
| Reminder drafts (friendly / professional / firm, WhatsApp / email, English / Hindi, UPI + NEFT, MSMED notice) | `POST /api/drafts` |
| Mark a cadence reminder sent (Day 1 / 16 / 31 queue is built on device from `reminder_events`) | `POST /api/reminders` |
| AI Conversation: voice note → outcome, amount, date, notes (Gemini) | `POST /api/voice-action` |
| CSV / Excel bulk import (Tally, Zoho Books, generic) | `POST /api/import` |
| Business profile: UPI, bank details, Udyam | `PATCH /api/tenant` |
| Team seats: invite with code, remove | `GET/POST/DELETE /api/team` |
| Help & support requests and replies | `GET/POST /api/support` |
| Sign-up (new business or invite code) | `POST /api/auth/signup` |

Plan gates (reminder cadence, UPI links, email tones, statutory notices, aging dashboard, bulk import, seats)
come from `src/lib/plans.ts`, a copy of the web app's plan table; the server enforces the same rules.
The demo login has no server session, so it runs all of these on sample data on the device.

## Gaps against the brief (backend, not built here)

- No `call_logs` table and no call-dispatch Edge Function. The swipe calls an Edge Function
  named `ai-recovery-call`; until it exists the slider reports "AI dialer isn't connected yet".
- No GSTIN column on `customers`, so search covers name, invoice number and mobile.
- Plans in the DB are `free / pro / growth` (₹0 / ₹499 / ₹1,499), not Free / Starter / Pro.
- Audit log is `admin_audit_log`, readable by platform admins only, not by vendors.
- No call-minute or WhatsApp-credit metering exists, so quotas show invoice usage (the only enforced limit) and counts.
- No realtime publication; the dispatch hub polls every 30 s.
- A login maps to one tenant (fn_my_tenant_id), so the tenant switcher has nothing to switch to.
