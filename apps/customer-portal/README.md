# RecoveryAI Pay: Customer / Debtor Portal

The debtor-facing app for RecoveryAI. Businesses that owe a RecoveryAI vendor sign in
with their phone, see what they owe, settle by UPI, or commit to a payment date
(which pauses AI reminder calls). Dark, CRED-style UI.

This is a separate Expo app from the vendor app at the repo root. It shares the same
Supabase project (`recovery-ai`).

## Stack

Expo SDK 57 · Expo Router · TypeScript · NativeWind 4 (Tailwind) · Reanimated 4 + Worklets ·
Gesture Handler · @gorhom/bottom-sheet 5 · expo-haptics / blur / secure-store /
local-authentication / screen-capture · Supabase JS.

> The brief asked for Reanimated v3. SDK 57 ships Reanimated 4, which keeps the v3 API
> (`useSharedValue`, `withSpring`, `useAnimatedStyle`, Gesture Handler). The only change
> used here is `scheduleOnRN` from `react-native-worklets`, the v4 name for `runOnJS`.

## Structure

```
apps/customer-portal/
├── app.json                 # bundle ids, Face ID / photo permission strings, UPI query schemes
├── babel.config.js          # babel-preset-expo + nativewind (Worklets plugin is added by the preset)
├── metro.config.js          # withNativeWind
├── tailwind.config.js       # CRED palette: obsidian / surface / line / emerald / gold / crimson
├── global.css
├── supabase/migrations/
│   └── 20261025170000_debtor_portal_rls.sql   # debtor RLS + portal RPCs (not applied yet)
└── src/
    ├── app/                 # Expo Router routes only
    │   ├── _layout.tsx      # GestureHandler, SafeArea, BottomSheetModalProvider, PrivacyShield
    │   └── index.tsx        # Customer Vault (home)
    ├── components/
    │   ├── CustomerDashboard.tsx         # Vault: hero counter, badges, rails, ledger
    │   ├── SwipeToPaySlider.tsx          # swipe-to-pay, haptic lock, UPI intent
    │   ├── CommitmentDatePickerSheet.tsx # "I will pay on 5th Nov" bottom sheet
    │   ├── RollingRupeeCounter.tsx       # odometer-style ₹ counter
    │   └── PrivacyShield.tsx             # blur on background + block screenshots
    ├── hooks/usePortalData.ts            # loads accounts / invoices / commitments
    ├── lib/
    │   ├── supabase.ts       # client, tokens in SecureStore, foreground-only refresh
    │   ├── secureStorage.ts  # chunked Keychain/Keystore adapter (sessions > 2 KB)
    │   ├── portalApi.ts      # RPC + RLS-backed queries
    │   └── format.ts         # ₹ Indian grouping, local-date helpers (no UTC drift)
    ├── data/mock.ts          # preview data when Supabase env is not set
    ├── theme/tokens.ts       # same palette for Reanimated / SVG / gradients
    └── types/portal.ts
```

Planned next (not built yet): `(auth)/login.tsx` phone OTP, biometric unlock gate,
invoice detail + PDF, dispute sheet with challan upload, activity log, profile / NOC.

## Packages

All installed with `npx expo install` so versions match SDK 57:

```bash
npx expo install expo-router expo-linking expo-constants expo-status-bar expo-font \
  react-native-safe-area-context react-native-screens \
  react-native-reanimated react-native-worklets react-native-gesture-handler \
  @gorhom/bottom-sheet react-native-svg expo-linear-gradient expo-blur expo-haptics \
  expo-secure-store expo-local-authentication expo-screen-capture expo-image-picker \
  nativewind tailwindcss @supabase/supabase-js react-native-url-polyfill \
  react-dom react-native-web
npx expo install babel-preset-expo -- --save-dev
```

## Run

```bash
cd apps/customer-portal
npm install
cp .env.example .env.local   # fill in Supabase URL + anon key (optional; mock data without it)
npx expo start               # press i / a, or w for web preview
```

Haptics, screenshot blocking, SecureStore and the UPI hand-off need a real device
(development build: `npx expo run:ios|android` or `eas build --profile development`).
Web is only for a quick visual check.

## Security model (summary)

* Debtor identity = OTP-verified Indian mobile on `auth.users`. Unverified phones and
  non-+91 numbers never match.
* Debtors can `SELECT` only invoices whose customer phone matches theirs (RLS).
* No debtor policies on `customers`, `tenants`, `commitments`: those carry AI risk
  scores, collector notes, call recordings and bank details. Debtors read them through
  `fn_portal_accounts()` / `fn_portal_commitments()`, which return safe columns only.
* The only write is `fn_portal_set_commitment()`: 1 to 30 days ahead, amount ≤ balance,
  max 2 per account per week, always logged as "Promise to Pay".
* UPI results are never trusted from the client. The app refreshes on return; the
  backend must confirm the payment (webhook / reconciliation) before marking invoices paid.
