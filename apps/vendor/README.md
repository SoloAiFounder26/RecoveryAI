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
npm i nativewind tailwindcss@^3.4 @supabase/supabase-js react-native-url-polyfill

cp .env.example .env.local    # fill in the Supabase URL + publishable key
npm start                     # Expo Go / dev client
npm run build:apk             # test APK via EAS (preview profile has a demo login)
```

Without `.env.local` the app runs in preview mode on sample data.

## Structure

```
apps/vendor/
├── app.json / eas.json        # bundle ids, Face ID string; preview APK profile with demo login
├── tailwind.config.js         # obsidian #08080A · abyss #121217 · card #16161F · hairline #262636
└── src/
    ├── app/                   # Expo Router routes only
    │   ├── _layout.tsx        # providers, BiometricShield around the whole stack, route guards
    │   ├── login.tsx          # Supabase Auth: email + password, or email OTP
    │   └── index.tsx          # → VendorDashboardScreen
    ├── screens/
    │   └── VendorDashboardScreen.tsx   # Command Vault
    ├── components/
    │   ├── BiometricShield.tsx         # Face ID on every open, blur on minimise, no screenshots
    │   ├── SwipeToRecoverSlider.tsx    # swipe-to-trigger AI recovery call
    │   ├── DebtorCard.tsx              # aging tag, overdue bar, expandable actions
    │   ├── DsoGauge.tsx                # DSO half-ring with the 45-day MSME line
    │   ├── GlassCard.tsx               # frosted card + metallic hairline
    │   └── RollingRupeeCounter.tsx     # odometer ₹ counter
    ├── hooks/useVendorDashboard.ts
    ├── lib/
    │   ├── vendorApi.ts       # RLS-scoped reads + fn_recovery_plan + AI-call request
    │   ├── metrics.ts         # aging buckets, DSO, recovered-this-month (pure, testable)
    │   ├── supabase.ts / secureStorage.ts   # session in Keychain / Keystore, never AsyncStorage
    │   ├── biometric.ts       # expo-local-authentication wrapper
    │   └── format.ts          # ₹ Indian grouping (₹14,25,000), local-date helpers
    ├── data/mock.ts           # sample book for previews / demo login
    ├── theme/tokens.ts
    └── types/vendor.ts        # row types matching the live schema
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

## Gaps against the brief (backend, not built here)

- No `call_logs` table and no call-dispatch Edge Function. The swipe calls an Edge Function
  named `ai-recovery-call`; until it exists the slider reports "AI dialer isn't connected yet".
- No GSTIN column on `customers`, so search covers name, invoice number and mobile.
- Plans in the DB are `free / pro / growth`, not Free / Starter / Pro.
- Audit log is `admin_audit_log`, readable by platform admins only, not by vendors.
- Vendors have read-only RLS; writes (pause AI calls, add invoices) go through
  service-role functions that the web app's server calls.
