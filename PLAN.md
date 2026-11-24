# Barbell Buddy — Product Specification & Implementation Plan

This document is a complete, standalone specification and architectural plan for **Barbell Buddy**, a collaborative real-time mobile Progressive Web App (PWA) for tracking gym workouts. Any developer or language model can use this file on its own to implement and verify the entire application from scratch.

---

## 1. Product Vision & User Requirements

Barbell Buddy helps a small crew of lifters (**Julie**, **Joel**, and **Leevi** initially, with support for adding more lifters later) log sets, reps, and weights in real time from their phones and track long-term strength progression.

### Core Requirements
1. **Mobile-First PWA on GitHub Pages**:
   - Deployable as a static Progressive Web App via **GitHub Pages**.
   - Installable on iPhone (Safari → Share → Add to Home Screen) and Android with standalone full-screen display, custom icons, offline shell caching, and dynamic status-bar theme colors.
2. **Starter Users & Shared Visibility**:
   - Three initial users: **Julie**, **Joel**, and **Leevi** (more can be added in-app at any time).
   - **Everyone can see everyone's historical data and progress.**
   - During a shared gym session, **any participant in that session can log or edit sets for themselves or any other participant** in the session (e.g., when spotting or sharing a bench).
3. **Real-Time Synchronization**:
   - Data updates instantly across devices/tabs. For example, when Joel logs a set for Julie, Julie sees it appear on her phone immediately without refreshing.
4. **Exercises & Pull-Up Modes**:
   - Five starter exercises:
     1. **Pull-ups** (`pullup`): Three explicit modes — **`Assisted`** (reps only; **no negative weight**), **`Bodyweight`** (reps only), and **`Weighted`** (additional kilograms `+kg` and reps).
     2. **Bench Press** (`barbell`: weight in `kg` + reps).
     3. **Incline Dumbbell Bench Press** (`dumbbell`: weight in `kg` with `per DB` hint + reps).
     4. **Deadlift** (`barbell`: weight in `kg` + reps).
     5. **Squat** (`barbell`: weight in `kg` + reps).
   - **Anyone** can add new exercise types (name + weight category). **Only Joel** can delete exercises.
5. **Participant-Scoped Sessions, Parallel Same-Day Workouts & 23:59 Auto-Save**:
   - Each gym workout is a **Session** named simply by its date (`YYYY-MM-DD`).
   - Users may work out together (e.g., Joel + Julie without Leevi), in separate groups on the same day (e.g., Joel + Leevi in one session while Julie has her own session), or all three solo on the same day.
   - Tab 1 starts with a **"New Session"** button when the phone's current Main User has no active session. Tapping **"New Session"** lets the user pick which lifters are participating in this session.
   - **Strict Live Session Visibility**: If Joel creates a session for **Joel** and **Leevi**, both Joel and Leevi immediately see and can log sets in that active session on Tab 1, while **Julie** does *not* see their live session in Tab 1 (she sees **"New Session"** so she can start her own session if desired).
   - A **"End Session"** button finishes and archives the session immediately. If **"End Session"** is not pressed, the session **automatically saves/finalizes at `23:59` (`23:59:59` local time)** on that session's date.
6. **Four-Tab Navigation**:
   - **Tab 1 — `Session`**: Start a new session or log sets, reps, and weights in the current participant-scoped session.
   - **Tab 2 — `History`**: Browse previous completed sessions (all users' sessions visible). Clicking a session reveals every exercise, set, rep, and weight performed in that session.
   - **Tab 3 — `Progress`**: View strength and rep progression charts and Personal Records (PRs) across all lifters and exercises.
   - **Tab 4 — `Settings`**: Switch the phone's Main User, customize color themes and secondary accent/border colors, and manage users and exercises.
7. **Admin Role, Joel's PIN (`2580`) & iPhone Face ID**:
   - **Joel** is the administrator (`is_admin = true`).
   - Switching the device's Main User to **Joel** requires either **Joel's 4-digit PIN (`2580`)** or **Face ID on iPhone** (via WebAuthn platform authenticator). Switching to non-admin users (Julie, Leevi, etc.) requires no PIN.
   - **Anyone** can add new users or new exercises; **only Joel** can delete users (except himself) or delete exercises.
8. **Color Themes & Secondary App Accent Colors**:
   - Three base color themes: **Light**, **Dark**, and **Pink / Light Pink**.
   - In **both Light and Dark themes**, users can pick a **Secondary App Color** used for widget borders, active pills/tabs, focus rings, and UI highlights: **Neon Green**, **Turquoise**, **Bright Orange**, **Electric Blue**, and **Vivid Purple**.

---

## 2. Technical Architecture & Stack

### Frontend & Tooling
- **Framework**: React 19 + TypeScript + Vite
- **Styling**: Tailwind CSS + CSS Custom Properties (`data-theme` and `data-accent` attributes on `<html>`) for zero-flicker theme and secondary border/accent switching
- **Icons**: `lucide-react`
- **PWA**: `vite-plugin-pwa` (Workbox `generateSW`, auto-update service worker, Web App Manifest, SVG + PNG Apple Touch & maskable icons, iOS standalone meta tags, dynamic `<meta name="theme-color">`)
- **Backend / Sync**: `@supabase/supabase-js` (Supabase Postgres + Realtime `postgres_changes`) with an automatic, zero-config **Local Realtime Store** (`localStorage` + `BroadcastChannel` + `window.onstorage`) when Supabase environment variables are absent
- **Testing**: Vitest + `@testing-library/react` + `@testing-library/user-event` + `jsdom`

### GitHub Pages Deployment
- **Vite Base Path**: Environment-aware `base` in `vite.config.ts` (`process.env.GITHUB_ACTIONS ? '/barbell-buddy/' : '/'`, or configurable via `VITE_BASE_PATH`) so local dev/tests and `https://<owner>.github.io/barbell-buddy/` both resolve assets and manifest paths cleanly.
- **CI/CD Workflow (`.github/workflows/deploy.yml`)**:
  - Triggers on pushes to `main` and manual `workflow_dispatch`.
  - Runs `npm ci`, typecheck (`npm run typecheck`), test suite (`npm test`), and production build (`npm run build`).
  - Passes optional repository secrets (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_CREW_AUTH_EMAIL`) at build time.
  - Deploys `dist/` to GitHub Pages via `actions/upload-pages-artifact` and `actions/deploy-pages`.

---

## 3. Data Model, Real-Time Sync & Dual-Adapter Store

### 3.1 Database Schema (`supabase/schema.sql`)

```sql
-- Extensions
create extension if not exists "pgcrypto";

-- 1. Lifters (Users)
create table public.lifters (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  avatar_color text not null default '#10b981',
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- 2. Admin Config (Salted bcrypt hash of Joel's PIN; never plaintext)
create table public.admin_config (
  id int primary key default 1 check (id = 1),
  pin_hash text not null
);

-- 3. Exercises
-- category: 'pullup' | 'barbell' | 'dumbbell' | 'bodyweight' | 'machine'
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null check (category in ('pullup', 'barbell', 'dumbbell', 'bodyweight', 'machine')),
  is_builtin boolean not null default false,
  sort_order int not null default 100,
  created_at timestamptz not null default now()
);

-- 4. Workout Sessions
create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  session_date text not null, -- 'YYYY-MM-DD' local date (serves as Session Name)
  status text not null default 'active' check (status in ('active', 'completed')),
  created_by uuid references public.lifters(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  expires_at timestamptz not null -- 23:59:59.999 local time on session_date
);

-- 5. Session Participants (many-to-many join)
create table public.session_participants (
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  lifter_id uuid not null references public.lifters(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (session_id, lifter_id)
);

-- 6. Workout Sets
create table public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  lifter_id uuid not null references public.lifters(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  pullup_mode text check (pullup_mode in ('assisted', 'bodyweight', 'weighted')),
  weight_kg numeric(6,2), -- NULL for assisted/bodyweight pull-ups; >= 0 for weighted lifts
  reps int not null check (reps > 0 and reps <= 999),
  logged_by uuid references public.lifters(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint valid_pullup_weight check (
    (pullup_mode in ('assisted', 'bodyweight') and weight_kg is null)
    or (pullup_mode = 'weighted' and weight_kg is not null and weight_kg >= 0)
    or (pullup_mode is null and (weight_kg is null or weight_kg >= 0))
  )
);
```

### 3.2 Row-Level Security & Admin RPCs
- Enable RLS on all tables. `lifters`, `exercises`, `workout_sessions`, `session_participants`, and `workout_sets` grant `SELECT`, `INSERT`, and `UPDATE` (plus `DELETE` on `workout_sets` for set corrections) `TO authenticated`.
- `admin_config` is inaccessible to direct `SELECT`; instead, `SECURITY DEFINER` Postgres RPCs enforce admin PIN verification:
  - `verify_admin_pin(pin_input text) returns boolean`: Compares `crypt(pin_input, pin_hash) = pin_hash`.
  - `admin_delete_lifter(target_lifter_id uuid, acting_lifter_id uuid)`: Verifies `acting_lifter_id` has `is_admin = true` and `target_lifter_id <> acting_lifter_id` before deleting.
  - `admin_delete_exercise(target_exercise_id uuid, acting_lifter_id uuid)`: Verifies `acting_lifter_id` has `is_admin = true` before deleting.
- Add `lifters`, `exercises`, `workout_sessions`, `session_participants`, and `workout_sets` to `supabase_realtime` publication.

### 3.3 Shared Crew Passcode & Wake Resync (Supabase Mode)
- When `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are configured:
  - If no Supabase session exists on the device, display a one-time **Crew Passcode** unlock screen that signs in via `supabase.auth.signInWithPassword({ email: VITE_CREW_AUTH_EMAIL, password })`. Supabase persists the JWT in `localStorage`.
  - Subscribe to a Supabase Realtime channel listening for `postgres_changes` (`*`) across all five workout tables.
  - Attach `document.addEventListener('visibilitychange', ...)` and `window.addEventListener('online', ...)` listeners to automatically re-fetch state and run the `23:59` expiration sweep whenever a locked mobile phone wakes up or regains connectivity.

### 3.4 Out-of-the-Box Local Realtime Store (Fallback / Demo Mode)
- Abstract all persistence behind a clean TypeScript `DataStore` interface:
  - `getSnapshot()`, `subscribe(listener)`, `refresh()`
  - `createSession(...)`, `addParticipantToSession(...)`, `endSession(...)`, `sweepExpiredSessions(now?)`
  - `addSet(...)`, `updateSet(...)`, `deleteSet(...)`
  - `addLifter(...)`, `deleteLifter(...)`, `addExercise(...)`, `deleteExercise(...)`
  - `verifyAdminPin(pin)`
- When Supabase env vars are not set, instantiate `LocalRealtimeStore`:
  - Seeds **Julie**, **Joel** (Admin), **Leevi**, and the **5 starter exercises** into `localStorage`.
  - Broadcasts mutations over `BroadcastChannel('barbell-buddy-sync')` and listens to `window` `storage` events so multiple open tabs synchronize instantaneously.
  - Enforces the exact same validation, non-negative weight rules, participant scoping, `23:59` auto-save sweep, and Joel-only admin checks as the Supabase adapter.

---

## 4. Security, Admin PIN & iPhone Face ID

### 4.1 Admin PIN Hygiene
- Joel's PIN is specified by the product owner as `2580`.
- **Never store the plaintext literal `"2580"` in application source code.**
  - In `supabase/schema.sql`, seed `admin_config` with a precomputed `pgcrypto` bcrypt hash.
  - In client TypeScript (`src/lib/adminAuth.ts`), verify against a precomputed salted SHA-256 hex digest using Web Crypto (`crypto.subtle.digest`) with a deterministic pure-JS SHA-256 fallback for non-secure contexts.
- Switching Main User to **Julie**, **Leevi**, or any newly added user switches immediately with zero friction.
- Switching Main User to **Joel** opens the **Admin Unlock Modal**, offering:
  1. **One-tap Face ID** (if WebAuthn is available and enrolled for Joel on this device), and
  2. **4-digit numeric PIN pad** (auto-submitting or confirming on 4 digits, with clear error feedback).

### 4.2 iPhone Face ID (`WebAuthn` Platform Authenticator)
- Implemented in `src/lib/webauthn.ts` using the browser's `PublicKeyCredential` API:
  - Capability check: `PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()`.
  - **Enrollment (`enrollFaceIdForAdmin`)**: Calls `navigator.credentials.create` with `authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' }`. Stores the resulting base64url `credentialId` in `localStorage` (`bb_joel_webauthn_cred_id`).
  - **Security invariant**: Enrolling Face ID on a device is **only** permitted while already authenticated as **Joel** (i.e., after entering Joel's PIN), preventing another person from enrolling their own Face ID to unlock Joel's admin profile.
  - **Verification (`verifyFaceIdForAdmin`)**: Calls `navigator.credentials.get` with `allowCredentials: [{ id, type: 'public-key', transports: ['internal'] }]` and `userVerification: 'required'` using a fresh `crypto.getRandomValues` challenge. On iOS Safari / installed PWA, this triggers native **Face ID** (or Touch ID / device passcode fallback).

---

## 5. Session Lifecycle & 23:59 Auto-Save Rules

1. **Session Name**: Always formatted as local calendar date `YYYY-MM-DD` (`session_date`).
2. **Expiration Timestamp (`expires_at`)**: Computed from the creator's local date at `23:59:59.999` (`new Date(year, month - 1, day, 23, 59, 59, 999).toISOString()`).
3. **Active Session Lookup for Main User**:
   - A session is active for `mainUserId` iff `session.status === 'active'`, `new Date(session.expiresAt).getTime() > now`, and `session.participantIds.includes(mainUserId)`.
4. **Parallel Same-Day Sessions & Overlap Prevention**:
   - Multiple sessions on the same `YYYY-MM-DD` are allowed as long as no single lifter is simultaneously in two `active` sessions.
   - In the **"New Session"** modal:
     - The current Main User is pre-selected.
     - Lifters who are free can be toggled on/off to join this session.
     - Any lifter currently in *another* active session is badged `"In active session"` and disabled so they aren't accidentally double-booked into two live sessions at once.
   - Inside an active session, a **"+ Lifter"** button lets participants add a late-arriving friend (who isn't in another active session) into the live workout.
5. **End Session & 23:59 Automatic Finalization**:
   - Every logged set is written immediately to storage (`workout_sets`), so zero set data is ever only in volatile memory.
   - Tapping **"End Session"** marks `status = 'completed'` and `ended_at = now`.
   - Automatic `23:59` finalization runs via three complementary mechanisms:
     1. A scheduled `setTimeout` targeting the earliest active session's `expires_at`.
     2. An interval / render check every 15 seconds.
     3. Immediate sweep on app startup, `visibilitychange === 'visible'`, `online`, and incoming sync updates—marking any `active` session with `expires_at <= now` as `completed` (`ended_at = expires_at`).

---

## 6. UI / UX Specification

### 6.1 Theme & Secondary Accent System
- Stored in `localStorage` (`bb_theme` and `bb_accent`) and applied to `document.documentElement` (`data-theme="dark|light|pink"`, `data-accent="neon-green|turquoise|bright-orange|electric-blue|vivid-purple"`):
  - **Light Theme**: Crisp light surfaces (`#f8fafc` background, `#ffffff` cards, high-contrast slate typography) paired with the chosen **Secondary App Color** on widget borders, active tabs, selected lifter pills, and primary controls.
  - **Dark Theme**: Deep gym-friendly obsidian surfaces (`#090d16` background, `#111827` cards, crisp white/slate text) paired with vibrant glowing **Secondary App Color** borders and accents.
  - **Pink / Light Pink Theme**: Soft blush/rose aesthetic (`#fff1f5` background, `#ffffff` / `#ffe4ec` surfaces, rose borders `#f43f5e` / `#ec4899`, deep rose typography).
- **Secondary App Colors** (selectable in Light and Dark themes):
  - **Neon Green** (`#39ff14` dark / `#16a34a` high-contrast text pairing in light, `#22c55e` border)
  - **Turquoise** (`#06b6d4` / `#2dd4bf`)
  - **Bright Orange** (`#ff6b00` / `#f97316`)
  - **Electric Blue** (`#3b82f6` / `#38bdf8`)
  - **Vivid Purple** (`#a855f7` / `#c084fc`)
- Dynamically updates `<meta name="theme-color">` to match the active theme background.

### 6.2 Top Header & Bottom Mobile Navigation
- **Compact Sticky Header**: App logo/title, Realtime Sync status dot, and current **Main User** chip (tapping jumps to user switcher or opens quick switch).
- **Bottom Navigation Bar** (safe-area padded for iPhone home indicator):
  1. `Session` (Dumbbell icon)
  2. `History` (Calendar/Clock icon)
  3. `Progress` (TrendingUp icon)
  4. `Settings` (Sliders/Settings icon)

### 6.3 Tab 1 — `Session`
- **No Active Session State**:
  - Welcomes the Main User by name, explains they have no active session right now, shows how many sessions were completed today (if any), and renders a prominent **"New Session"** CTA button.
  - **"New Session" Modal / Sheet**: Date (`YYYY-MM-DD`), multi-select checklist of lifters (Main User pre-selected, busy lifters clearly marked), and **"Start Session"**.
- **Active Session View**:
  - **Session Banner**: Session name (`YYYY-MM-DD`), participant chips, **"+ Add Lifter"** button (when eligible lifters exist), auto-saves at `23:59` badge, and **"End Session"** button.
  - **Logging For (Participant Switcher)**: Large 1-tap pills for each participant in this session (e.g., `Joel`, `Julie`). Switching lifter automatically pre-fills that lifter's most recent weight/reps/mode for the currently selected exercise.
  - **Set Entry Widget**:
    - Exercise dropdown / horizontally scrollable chips + quick **"+ Exercise"** modal trigger.
    - When **Pull-ups** is selected: 3-way segmented control **`Assisted` | `Bodyweight` | `Weighted`**:
      - `Assisted` & `Bodyweight`: Hides weight input completely (reps only; never negative weights).
      - `Weighted`: Shows **`+ kg` Additional Weight** stepper (`-2.5`, `-1`, direct numeric input `>= 0`, `+1`, `+2.5`).
    - When a weighted exercise is selected (`Bench Press`, `Incline Dumbbell Bench Press`, `Deadlift`, `Squat`, or custom weighted): Shows **Weight (`kg`)** stepper (`per DB` helper badge shown for dumbbell exercises) + **Reps** stepper (`-1`, direct input, `+1`).
    - Prominent **"Add Set"** button.
  - **Current Session Sets Feed**:
    - Grouped by exercise performed in this session.
    - Shows each set with lifter badge, per-lifter set number (`Set #1`, `Set #2`), formatted load (`Assisted × 10 reps`, `BW × 8 reps`, `+15 kg × 5 reps`, `80 kg × 5 reps`), and inline **Edit** / **Delete** controls.

### 6.4 Tab 2 — `History`
- Shows **all** completed sessions across **all** lifters, sorted newest first (`session_date DESC, started_at DESC`).
- **Lifter Filter Pills**: `All`, `Julie`, `Joel`, `Leevi`, etc.
- **Session Cards**:
  - Displays session date (`YYYY-MM-DD`), participant badges (making parallel same-day sessions immediately distinguishable, e.g., `2026-11-24 · Joel, Leevi` vs `2026-11-24 · Julie`), total set count, and exercise tags.
  - Clicking a session card toggles an expanded detail view listing every exercise and each lifter's sets, weights/modes, and reps from that session.

### 6.5 Tab 3 — `Progress`
- Visible for **all** lifters so everyone can celebrate and compare progress.
- **Controls**:
  - Exercise selector (defaults to `Bench Press` or `Pull-ups`).
  - For `Pull-ups`, sub-mode selector: **`Assisted` (Max Reps)** | **`Bodyweight` (Max Reps)** | **`Weighted` (Top `+kg` & Est. Load)**.
  - For weighted lifts, metric toggle: **Top Weight (`kg`)** | **Estimated 1RM (`kg`, Epley formula $w \times (1 + r/30)$)**.
  - Lifter filter toggles (compare Julie, Joel, Leevi side-by-side on the same SVG progression chart).
- **Visualizations**:
  - Responsive multi-line SVG chart plotting progression by session date with interactive data points.
  - **Personal Records (PRs)** summary grid per lifter for the selected exercise, plus recent lift log table.

### 6.6 Tab 4 — `Settings`
- **Active Phone User (Main User)**:
  - Tap any user to make them this phone's Main User.
  - Selecting **Joel** triggers the **PIN (`2580`) / Face ID** verification dialog.
  - When **Joel** is currently active and the device supports WebAuthn platform biometrics, displays an **iPhone Face ID Unlock** section allowing Joel to enable/enroll or remove Face ID on this device.
- **Appearance**:
  - **Theme Selector**: `Light`, `Dark`, `Pink / Light Pink`.
  - **Secondary App Color** (enabled in `Light` and `Dark` themes; gracefully noted as automatic rose styling when `Pink` theme is active): Swatches for `Neon Green`, `Turquoise`, `Bright Orange`, `Electric Blue`, `Vivid Purple`.
- **Manage Lifters**:
  - Add new lifter (name + avatar color) — available to **everyone**.
  - Delete lifter (with confirmation dialog) — visible and permitted **only when Main User is Joel** (Joel's own admin profile cannot be deleted).
- **Manage Exercises**:
  - Add new exercise (name + category: `Barbell`, `Dumbbell`, `Machine`, `Bodyweight`, `Pull-up style`) — available to **everyone**.
  - Remove exercise (with confirmation dialog) — visible and permitted **only when Main User is Joel**.
- **Sync & Storage Info**:
  - Displays whether connected to **Supabase Cloud Realtime** or **Local Realtime Mode**, with option to force resync or sign out of the Shared Crew Passcode (when in Supabase mode).

---

## 7. Project Directory Structure

```text
barbell-buddy/
├── .github/
│   └── workflows/
│       └── deploy.yml             # CI checks + GitHub Pages deployment
├── public/
│   ├── favicon.svg                # Vector app icon
│   ├── apple-touch-icon.png       # 180x180 iOS Home Screen icon
│   ├── pwa-192x192.png            # 192x192 Android/PWA icon
│   └── pwa-512x512.png            # 512x512 Android/PWA maskable icon
├── supabase/
│   └── schema.sql                 # Complete Postgres schema, RLS, Realtime, RPCs & seeds
├── src/
│   ├── types/
│   │   └── models.ts              # Domain types, theme/accent types, DataStore contract
│   ├── lib/
│   │   ├── adminAuth.ts           # Salted SHA-256 PIN verification (no plaintext PIN)
│   │   ├── webauthn.ts            # iPhone Face ID / platform WebAuthn enrollment & auth
│   │   ├── dates.ts               # YYYY-MM-DD formatting & 23:59:59 local expiry helpers
│   │   ├── metrics.ts             # PRs, Epley 1RM, Pull-up mode progression calculations
│   │   ├── seedData.ts            # Starter lifters (Julie, Joel, Leevi) & 5 exercises
│   │   ├── localStore.ts          # localStorage + BroadcastChannel realtime DataStore
│   │   ├── supabaseStore.ts       # Supabase Postgres + Realtime DataStore + Crew Auth
│   │   └── storeFactory.ts        # Environment-aware store initialization
│   ├── context/
│   │   ├── AppContext.tsx         # Global state, realtime sync, 23:59 auto-save timer, wake resync
│   │   └── ThemeContext.tsx       # Light/Dark/Pink theme + Secondary App Color controller
│   ├── components/
│   │   ├── Header.tsx             # Sticky mobile header + Main User badge + sync indicator
│   │   ├── BottomNav.tsx          # 4-tab mobile navigation bar
│   │   ├── OnboardingModal.tsx    # First-visit Main User picker
│   │   ├── AdminUnlockModal.tsx   # Joel PIN keypad + Face ID unlock modal
│   │   ├── CrewAuthScreen.tsx     # Shared Crew Passcode login screen (Supabase mode)
│   │   ├── SessionTab.tsx         # Tab 1: New Session, participant-scoped live logger & feed
│   │   ├── HistoryTab.tsx         # Tab 2: Completed sessions list + expandable set details
│   │   ├── ProgressTab.tsx        # Tab 3: SVG progression charts + PR cards across lifters
│   │   └── SettingsTab.tsx        # Tab 4: Switch user, Face ID, themes/accents, manage users/exercises
│   ├── test/
│   │   ├── setup.ts               # Vitest + Testing Library + WebCrypto/BroadcastChannel mocks
│   │   └── app.test.tsx           # Comprehensive unit & integration tests
│   ├── App.tsx
│   ├── index.css                  # Tailwind + theme/secondary-accent CSS custom properties
│   └── main.tsx
├── PLAN.md                        # Standalone product & engineering specification
├── README.md                      # Setup, Supabase, GitHub Pages & mobile install guide
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 8. Verification & Acceptance Criteria

1. **Participant-Scoped Live Sessions & Parallel Same-Day Workouts**:
   - Creating a session for `Joel` + `Leevi` shows the active session when Main User is `Joel` or `Leevi`, while switching Main User to `Julie` shows `"New Session"` so `Julie` can run an independent session on the same date.
2. **Real-Time Cross-Client Sync**:
   - Logging or editing a set in one store instance / tab propagates immediately to subscribed clients.
3. **23:59 Automatic Session Finalization**:
   - Any active session whose `expires_at` (`23:59:59` local time on `session_date`) has passed transitions automatically to `completed` and appears in `History` with all logged sets intact, even if `"End Session"` was never pressed.
4. **Pull-Up Modes & Exercise Inputs**:
   - `Pull-ups` supports `Assisted` (reps only, `weightKg = null`, never negative), `Bodyweight` (reps only, `weightKg = null`), and `Weighted` (`+kg >= 0` + reps).
   - Starter exercises include `Pull-ups`, `Bench Press`, `Incline Dumbbell Bench Press`, `Deadlift`, and `Squat`.
5. **Joel's Admin PIN (`2580`), Face ID & Admin-Only Deletions**:
   - Switching to `Joel` requires PIN `2580` (verified via cryptographic hash) or enrolled WebAuthn Face ID; wrong PINs are rejected.
   - Any user can add lifters and exercises; only `Joel` sees and can execute lifter deletion (excluding himself) and exercise deletion.
6. **Themes & Secondary App Colors**:
   - Switching between `Light`, `Dark`, and `Pink / Light Pink` updates `data-theme` and `<meta name="theme-color">`.
   - Selecting `Neon Green`, `Turquoise`, `Bright Orange`, `Electric Blue`, or `Vivid Purple` updates `data-accent` widget borders and highlights in both `Light` and `Dark` modes.
7. **Automated Quality Gates**:
   - `npm run typecheck` (`tsc -b`) passes with zero errors.
   - `npm test` (`vitest run`) passes all unit and integration tests.
   - `npm run build` (`vite build`) produces a production bundle with PWA manifest and service worker ready for GitHub Pages.
