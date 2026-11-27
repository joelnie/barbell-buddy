# Barbell Buddy

**Barbell Buddy** is a mobile-first Progressive Web App (PWA) for tracking gym sets, reps, and weights in real time with your workout crew. Built with **React + TypeScript + Vite + Tailwind CSS + Supabase Realtime**, it deploys directly to **GitHub Pages** and installs to your iPhone or Android home screen.

> See [`PLAN.md`](./PLAN.md) for the complete standalone product specification and architecture plan.

---

## Features

- **Starter Crew & Open Progress**: Comes ready with **Julie** (pink), **Joel** (Admin), **Leevi**, and **Tuomas**, plus support for adding new lifters anytime. Everyone can view historical sessions and strength curves, and partners in the same workout can log sets for one another.
- **100 % suomenkielinen käyttöliittymä & vaihtuvat treenilauseet**:
  - Koko sovellus on suomeksi (`Treeni`, `Historia`, `Kehitys`, `Asetukset`) ja tukee myös aiemmin luotuja englanninkielisiä Supabase-liikerivejä automaattisesti.
  - Aloitusnäkymässä vaihtuu 22 motivoivaa suomenkielistä treenilausetta (mukaan lukien käyttäjän nimellä personoidut tervehdykset).
- **Starter & Custom Exercises with Dual Vertical Sliders**:
  - **Left Vertical Slider**: **Toistot** (`1`–`20`) with smooth wheel scrolling and `+` / `−` precision steppers.
  - **Right Vertical Slider**: Exercise-tailored discrete weight stops — **Leuanveto** (`Kuminauha`, `Kehonpaino`, `+2.5` to `+30 kg`, never negative weight), **Penkkipunnerrus** (`20`–`120 kg` by `2.5`), **Kyykky** (`20`–`150 kg` by `2.5`), **Maastaveto** (`25`–`180 kg` by `2.5`), **Käsipaino (x2) / Vinopenkki käsipainoilla** (`Paino (x2)`, `8, 9, 10, 12, …, 40 kg`), **Käsipaino (x1)** (`Paino`, `1, 2, …, 10, 12, …, 40 kg`), and **Laite / Talja** (`2.5`–`120 kg` by `2.5`).
- **Participant-Scoped Live Sessions, Parallel Workouts & Live Read-Only Inspection**:
  - Sessions are named by date (`YYYY-MM-DD`).
  - Tap **Uusi treeni** and select who is lifting together. Only selected participants can log or edit sets in that session—allowing other lifters to run separate sessions on the very same day—while non-participants can follow ongoing workouts live in read-only mode (**Käynnissä nyt**) inside the **Treeni** tab.
  - Tap **Lopeta treeni** when finished, or let Barbell Buddy **auto-save and finalize the session at `23:59`** local time automatically (completed sessions then move to **Historia**).
- **4-Tab Mobile Experience**:
  1. **Treeni**: Start a session, switch between session partners in 1 tap, log/edit sets live, and watch friends' ongoing workouts in real-time read-only mode.
  2. **Historia**: Browse all previous sessions, tap any session to inspect every exercise, set, rep, and weight, or delete sessions from history with an `"Oletko varma?"` confirmation.
  3. **Kehitys**: Multi-lifter SVG progression charts (Top Weight, Estimated 1RM, and Pull-up mode breakdowns) + Personal Record cards.
  4. **Asetukset**: Switch Main User, customize themes & secondary widget border colors, manage users and exercises (**Joel** can rename exercises across all sessions), and restore deleted sessions (**Poistetut treenit**, visible to **Joel** at the bottom of Settings).
- **Admin PIN**:
  - Switching Main User to **Joel** requires his 4-digit admin PIN.
  - Anyone can add new users or exercises; **only Joel** can delete users, rename or remove exercises, and restore sessions deleted from history.
- **Themes & Secondary App Colors**:
  - Choose between **Vaalea**, **Tumma**, and **Pinkki** themes.
  - In **Vaalea** and **Tumma** themes, customize **Korostusväri** for widget borders and active highlights (**Neonvihreä**, **Turkoosi**, **Kirkkaanoranssi**, **Sähkönsininen**, **Kirkkaanvioletti**).

---

## Local Development

```bash
npm install
npm run dev
```

Without Supabase environment variables configured, Barbell Buddy automatically runs using its **Local Realtime Store** (`localStorage` + `BroadcastChannel`), syncing instantly across multiple browser tabs out of the box.

### Quality Checks

```bash
npm run typecheck   # TypeScript project build check (tsc -b)
npm test            # Vitest + React Testing Library suite
npm run build       # Production PWA build into dist/
```

---

## Connecting Supabase for Cross-Phone Cloud Sync

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** in your Supabase dashboard, paste the contents of [`supabase/schema.sql`](./supabase/schema.sql), and click **Run**.
   - This creates all tables, starter seed data (`Julie`, `Joel`, `Leevi`, and the 5 exercises), Row-Level Security policies, admin PIN/deletion RPCs, and adds the tables to `supabase_realtime`.
3. Create the **Shared Crew Passcode** account:
   - In Supabase Dashboard → **Authentication → Users → Add user → Create new user**:
     - **Email**: `crew@barbellbuddy.app` (or your preferred crew email)
     - **Password**: Choose a shared crew passcode for Julie, Joel, and Leevi
     - Enable **Auto Confirm User**.
4. Copy `.env.example` to `.env.local` for local cloud testing:
   ```env
   VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<your-anon-public-key>
   VITE_CREW_AUTH_EMAIL=crew@barbellbuddy.app
   ```

---

## Deploying to GitHub Pages

1. In your GitHub repository, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**.
2. Open **Settings → Secrets and variables → Actions** and add repository secrets (optional if using Local Realtime mode, required for cross-phone cloud sync):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_CREW_AUTH_EMAIL`
3. Push to `main` (or trigger **Deploy Barbell Buddy PWA to GitHub Pages** manually in the **Actions** tab). Your PWA will be live at `https://<username>.github.io/barbell-buddy/`.

---

## Installing on Mobile

### iPhone (iOS Safari)
1. Open your GitHub Pages URL in **Safari** on iPhone.
2. Tap the **Share** button (square with upward arrow) → **Add to Home Screen** → **Add**.
3. Launch **Barbell Buddy** from your Home Screen.

### Android (Chrome)
1. Open your GitHub Pages URL in **Chrome**.
2. Tap the **⋮** menu → **Add to Home screen / Install app**.
