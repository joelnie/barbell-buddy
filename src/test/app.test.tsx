import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { LocalRealtimeStore } from '../lib/localStore';
import { computeSessionExpiryIso } from '../lib/dates';
import { STARTER_EXERCISES } from '../lib/seedData';
import {
  getRawWeightOptionsForExercise,
  getRepsSliderStops,
  getWeightSliderStopsForExercise,
} from '../lib/sliderOptions';

async function enterJoelKeypadPin(user: ReturnType<typeof userEvent.setup>, digits: string[]) {
  const dialog = await screen.findByRole('dialog', { name: /switch to joel/i });
  for (const d of digits) {
    await user.click(within(dialog).getByRole('button', { name: d }));
  }
}

describe('Barbell Buddy PWA', () => {
  it('seeds Julie, Joel, and Leevi plus all 5 starter exercises', async () => {
    const store = new LocalRealtimeStore({ storageKey: 'test-seed' });
    await store.initialize();
    const snap = store.getSnapshot();

    expect(snap.lifters.map((l) => l.name)).toEqual(['Julie', 'Joel', 'Leevi']);
    expect(snap.lifters.find((l) => l.name === 'Joel')?.isAdmin).toBe(true);
    expect(snap.exercises.map((e) => e.name)).toEqual([
      'Pull-ups',
      'Bench Press',
      'Incline Dumbbell Bench Press',
      'Deadlift',
      'Squat',
    ]);
    store.dispose();
  });

  it('scopes live sessions strictly to selected participants and allows parallel same-day sessions', async () => {
    const sharedStorageKey = 'test-parallel-sessions';
    const channelName = 'test-parallel-chan';

    const storeJoel = new LocalRealtimeStore({ storageKey: sharedStorageKey, channelName });
    const storeLeevi = new LocalRealtimeStore({ storageKey: sharedStorageKey, channelName });
    const storeJulie = new LocalRealtimeStore({ storageKey: sharedStorageKey, channelName });

    await Promise.all([
      storeJoel.initialize(),
      storeLeevi.initialize(),
      storeJulie.initialize(),
    ]);

    // Joel starts a session for Joel + Leevi (excluding Julie) on 2026-11-24
    const sessionJoelLeevi = await storeJoel.createSession({
      createdBy: 'lifter-joel',
      participantIds: ['lifter-joel', 'lifter-leevi'],
      sessionDate: '2026-11-24',
      now: new Date(2026, 10, 24, 10, 0, 0),
    });

    expect(sessionJoelLeevi.participantIds).toEqual(['lifter-joel', 'lifter-leevi']);

    // Render Leevi's phone -> immediately sees the active session created by Joel!
    localStorage.setItem('leevi-main-user', 'lifter-leevi');
    const leeviView = render(
      <App store={storeLeevi} mainUserStorageKey="leevi-main-user" />,
    );
    expect(await leeviView.findByText(/Session 2026-11-24/i)).toBeInTheDocument();
    expect(leeviView.getByRole('button', { name: /End Session/i })).toBeInTheDocument();
    leeviView.unmount();

    // Render Julie's phone -> does NOT see Joel+Leevi's live session; sees "New Session" instead!
    const user = userEvent.setup();
    localStorage.setItem('julie-main-user', 'lifter-julie');
    render(<App store={storeJulie} mainUserStorageKey="julie-main-user" />);

    expect(await screen.findByText(/Ready to lift, Julie\?/i)).toBeInTheDocument();
    expect(screen.queryByText(/Session 2026-11-24/i)).not.toBeInTheDocument();

    // Julie opens "New Session" -> Joel & Leevi are marked busy in another active session, while Julie can start her own session!
    await user.click(screen.getByRole('button', { name: /New Session/i }));
    expect(screen.getAllByText(/In another active session/i)).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: /Start Session \(1\)/i }));
    expect(await screen.findByText(/Add Set for Julie/i)).toBeInTheDocument();

    // Verify 2 distinct active sessions exist on the exact same day
    const allSessions = storeJulie.getSnapshot().sessions;
    expect(allSessions.filter((s) => s.status === 'active')).toHaveLength(2);

    storeJoel.dispose();
    storeLeevi.dispose();
    storeJulie.dispose();
  });

  it('syncs sets in real time when one partner logs a set for another', async () => {
    const sharedStorageKey = 'test-realtime-sync';
    const channelName = 'test-realtime-chan';

    const storeA = new LocalRealtimeStore({ storageKey: sharedStorageKey, channelName });
    const storeB = new LocalRealtimeStore({ storageKey: sharedStorageKey, channelName });
    await Promise.all([storeA.initialize(), storeB.initialize()]);

    await storeA.createSession({
      createdBy: 'lifter-julie',
      participantIds: ['lifter-julie', 'lifter-leevi'],
    });

    const user = userEvent.setup();
    localStorage.setItem('phone-julie', 'lifter-julie');
    render(<App store={storeB} mainUserStorageKey="phone-julie" />);

    expect(await screen.findByText(/No sets logged yet/i)).toBeInTheDocument();

    // Leevi (on storeA / another phone) logs a Bench Press set of 55 kg x 8 for Julie
    const activeSessionId = storeA.getSnapshot().sessions[0].id;
    await act(async () => {
      await storeA.addSet({
        sessionId: activeSessionId,
        lifterId: 'lifter-julie',
        exerciseId: 'ex-bench-press',
        weightKg: 55,
        reps: 8,
        loggedBy: 'lifter-leevi',
      });
    });

    // Julie's rendered UI updates automatically via BroadcastChannel without reloading!
    expect(await screen.findByText(/55 kg × 8 reps/i)).toBeInTheDocument();
    expect(screen.getByText(/\(added by Leevi\)/i)).toBeInTheDocument();

    // Julie can also log a set for Leevi directly from her UI using the two vertical sliders
    await user.click(screen.getByRole('button', { name: 'Leevi' }));
    await user.selectOptions(screen.getByLabelText('Exercise'), 'ex-squat');

    const squatEx = STARTER_EXERCISES.find((e) => e.id === 'ex-squat')!;
    const squatStops = getWeightSliderStopsForExercise(squatEx);
    const idx110 = squatStops.findIndex((s) => s.rawValue === 110);

    fireEvent.change(screen.getByRole('slider', { name: 'Weight' }), {
      target: { value: String(idx110) },
    });
    fireEvent.change(screen.getByRole('slider', { name: 'Reps' }), {
      target: { value: '4' }, // index 4 => 5 reps
    });

    await user.click(screen.getByRole('button', { name: /Add Set for Leevi/i }));

    expect(await screen.findByText(/110 kg × 5 reps/i)).toBeInTheDocument();
    expect(storeA.getSnapshot().sets).toHaveLength(2);

    storeA.dispose();
    storeB.dispose();
  });

  it('defines exact discrete slider stops for Reps (1-30), Pull-ups, Bench, Squat, Deadlift (25-180), and Dumbbells', () => {
    const repsStops = getRepsSliderStops();
    expect(repsStops).toHaveLength(30);
    expect(repsStops[0].rawValue).toBe(1);
    expect(repsStops[29].rawValue).toBe(30);

    const pullups = STARTER_EXERCISES.find((e) => e.id === 'ex-pullups')!;
    expect(getRawWeightOptionsForExercise(pullups)).toEqual([
      'Assisted',
      'Bodyweight',
      2.5,
      5,
      7.5,
      10,
      12.5,
      15,
      17.5,
      20,
      22.5,
      25,
      27.5,
      30,
    ]);

    const bench = STARTER_EXERCISES.find((e) => e.id === 'ex-bench-press')!;
    const benchOpts = getRawWeightOptionsForExercise(bench);
    expect(benchOpts[0]).toBe(20);
    expect(benchOpts[1]).toBe(22.5);
    expect(benchOpts[benchOpts.length - 1]).toBe(120);
    expect(benchOpts).toHaveLength(41);

    const squat = STARTER_EXERCISES.find((e) => e.id === 'ex-squat')!;
    const squatOpts = getRawWeightOptionsForExercise(squat);
    expect(squatOpts[0]).toBe(20);
    expect(squatOpts[1]).toBe(22.5);
    expect(squatOpts[squatOpts.length - 1]).toBe(150);
    expect(squatOpts).toHaveLength(53);

    const deadlift = STARTER_EXERCISES.find((e) => e.id === 'ex-deadlift')!;
    const deadliftOpts = getRawWeightOptionsForExercise(deadlift);
    expect(deadliftOpts[0]).toBe(25);
    expect(deadliftOpts[1]).toBe(27.5);
    expect(deadliftOpts[deadliftOpts.length - 1]).toBe(180);
    expect(deadliftOpts).toHaveLength(63);

    const inclineDb = STARTER_EXERCISES.find((e) => e.id === 'ex-incline-db-bench')!;
    expect(getRawWeightOptionsForExercise(inclineDb)).toEqual([
      8, 9, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40,
    ]);

    // Custom dumbbell exercise uses exact same dumbbell stop array
    expect(
      getRawWeightOptionsForExercise({
        id: 'ex-custom-curl',
        name: 'Dumbbell Curl',
        category: 'dumbbell',
        isBuiltin: false,
        sortOrder: 99,
        createdAt: '2026-11-24T00:00:00.000Z',
      }),
    ).toEqual([8, 9, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40]);

    // Custom bodyweight exercise uses ['Bodyweight']
    expect(
      getRawWeightOptionsForExercise({
        id: 'ex-custom-dips',
        name: 'Push-ups',
        category: 'bodyweight',
        isBuiltin: false,
        sortOrder: 100,
        createdAt: '2026-11-24T00:00:00.000Z',
      }),
    ).toEqual(['Bodyweight']);
  });

  it('logs Pull-ups (Assisted, Bodyweight, +kg) and weighted lifts via vertical sliders, touch drag, and smart snapping', async () => {
    const user = userEvent.setup();
    const store = new LocalRealtimeStore({ storageKey: 'test-pullups-sliders' });
    await store.initialize();

    localStorage.setItem('pullup-user', 'lifter-julie');
    render(<App store={store} mainUserStorageKey="pullup-user" />);

    await user.click(await screen.findByRole('button', { name: /New Session/i }));
    await user.click(screen.getByRole('button', { name: /Start Session/i }));

    // Separate Pull-up mode toggle row is replaced by the Weight vertical slider
    expect(screen.queryByRole('group', { name: /Pull-up mode/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Exercise')).toHaveValue('ex-pullups');

    const repsSlider = screen.getByRole('slider', { name: 'Reps' });
    const weightSlider = screen.getByRole('slider', { name: 'Weight' });

    // Default for Pull-ups: Bodyweight (index 1) and 8 reps (index 7)
    expect(weightSlider).toHaveAttribute('aria-valuetext', 'Bodyweight');
    expect(repsSlider).toHaveAttribute('aria-valuetext', '8 reps');

    // 1. Step down 1 notch on Weight -> Assisted (index 0), step up twice on Reps -> 10 reps
    await user.click(screen.getByRole('button', { name: 'Decrease weight' }));
    expect(weightSlider).toHaveAttribute('aria-valuetext', 'Assisted');
    await user.click(screen.getByRole('button', { name: 'Increase reps' }));
    await user.click(screen.getByRole('button', { name: 'Increase reps' }));
    expect(repsSlider).toHaveAttribute('aria-valuetext', '10 reps');

    await user.click(screen.getByRole('button', { name: /Add Set for Julie/i }));
    expect(await screen.findByText(/Assisted × 10 reps/i)).toBeInTheDocument();

    // 2. Step up 1 notch on Weight -> Bodyweight (index 1), set Reps to 7 (index 6)
    await user.click(screen.getByRole('button', { name: 'Increase weight' }));
    expect(weightSlider).toHaveAttribute('aria-valuetext', 'Bodyweight');
    fireEvent.change(repsSlider, { target: { value: '6' } });
    await user.click(screen.getByRole('button', { name: /Add Set for Julie/i }));
    expect(await screen.findByText(/Bodyweight × 7 reps/i)).toBeInTheDocument();

    // 3. Weighted Pull-ups via vertical pointer scrubbing on the track!
    const weightTrack = screen.getByTestId('weight-slider-track');
    expect(weightTrack).toHaveClass('touch-none', 'bb-slider-track');
    vi.spyOn(weightTrack, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      bottom: 332,
      left: 0,
      right: 120,
      width: 120,
      height: 232, // usable height = 232 - 32 = 200px
      x: 0,
      y: 100,
      toJSON: () => ({}),
    });

    // Pull-up stops length = 14 (maxIndex = 13). Index 6 => 12.5 kg (ratio = 6/13)
    // yFromTop = usableHeight * (1 - 6/13) = 200 * (7/13) ≈ 107.69 => clientY = 100 + 16 + 107.69 = 223.69
    fireEvent.pointerDown(weightTrack, { pointerId: 1, clientY: 280 });
    fireEvent.pointerMove(weightTrack, { pointerId: 1, clientY: 223.7 });
    fireEvent.pointerUp(weightTrack, { pointerId: 1, clientY: 223.7 });

    expect(weightSlider).toHaveAttribute('aria-valuetext', '+12.5 kg');
    fireEvent.change(repsSlider, { target: { value: '4' } }); // 5 reps
    await user.click(screen.getByRole('button', { name: /Add Set for Julie/i }));
    expect(await screen.findByText(/\+12\.5 kg × 5 reps/i)).toBeInTheDocument();

    // 4. Switch to Deadlift -> minimum stop is 25 kg (index 0), top stop is 180 kg (index 62)
    await user.selectOptions(screen.getByLabelText('Exercise'), 'ex-deadlift');
    fireEvent.change(weightSlider, { target: { value: '0' } });
    expect(weightSlider).toHaveAttribute('aria-valuetext', '25 kg');
    fireEvent.change(weightSlider, { target: { value: '62' } });
    expect(weightSlider).toHaveAttribute('aria-valuetext', '180 kg');

    // Switch back to Pull-ups -> smartly snaps back to Julie's last Pull-up set (+12.5 kg x 5 reps)
    await user.selectOptions(screen.getByLabelText('Exercise'), 'ex-pullups');
    expect(weightSlider).toHaveAttribute('aria-valuetext', '+12.5 kg');
    expect(repsSlider).toHaveAttribute('aria-valuetext', '5 reps');

    const sets = store.getSnapshot().sets;
    expect(sets).toHaveLength(3);
    expect(sets[0]).toMatchObject({ pullupMode: 'assisted', weightKg: null, reps: 10 });
    expect(sets[1]).toMatchObject({ pullupMode: 'bodyweight', weightKg: null, reps: 7 });
    expect(sets[2]).toMatchObject({ pullupMode: 'weighted', weightKg: 12.5, reps: 5 });

    // Store strictly rejects negative pull-up weights
    await expect(
      store.addSet({
        sessionId: sets[0].sessionId,
        lifterId: 'lifter-julie',
        exerciseId: 'ex-pullups',
        pullupMode: 'weighted',
        weightKg: -15,
        reps: 8,
        loggedBy: 'lifter-julie',
      }),
    ).rejects.toThrow(/0 kg or greater|negative/i);

    store.dispose();
  });

  it('auto-saves and finalizes unended sessions at 23:59 local time and displays sets in History', async () => {
    const user = userEvent.setup();
    const store = new LocalRealtimeStore({ storageKey: 'test-autosave-2359' });
    await store.initialize();

    const morningOfSession = new Date(2026, 10, 20, 18, 30, 0);
    const session = await store.createSession({
      createdBy: 'lifter-leevi',
      participantIds: ['lifter-leevi'],
      sessionDate: '2026-11-20',
      now: morningOfSession,
    });

    // Verify expiry is 23:59:59.999 local time on 2026-11-20
    expect(session.expiresAt).toBe(computeSessionExpiryIso('2026-11-20'));
    const expiryLocal = new Date(session.expiresAt);
    expect(expiryLocal.getHours()).toBe(23);
    expect(expiryLocal.getMinutes()).toBe(59);

    await store.addSet({
      sessionId: session.id,
      lifterId: 'lifter-leevi',
      exerciseId: 'ex-deadlift',
      weightKg: 160,
      reps: 4,
      loggedBy: 'lifter-leevi',
    });

    // Before 23:59 (at 23:58), session remains active
    const sweptBefore = await store.sweepExpiredSessions(new Date(2026, 10, 20, 23, 58, 0));
    expect(sweptBefore).toBe(0);
    expect(store.getSnapshot().sessions[0].status).toBe('active');

    // Just after 23:59:59, sweep finalizes the session automatically without pressing End Session
    const sweptAfter = await store.sweepExpiredSessions(new Date(2026, 10, 21, 0, 0, 1));
    expect(sweptAfter).toBe(1);
    expect(store.getSnapshot().sessions[0].status).toBe('completed');
    expect(store.getSnapshot().sessions[0].endedAt).toBe(session.expiresAt);

    // Open History tab and click the 2026-11-20 session -> shows Deadlift 160 kg x 4 reps
    localStorage.setItem('history-user', 'lifter-julie');
    render(<App store={store} mainUserStorageKey="history-user" />);
    await user.click(await screen.findByRole('tab', { name: /History/i }));

    const sessionCardButton = await screen.findByRole('button', { name: /2026-11-20/i });
    await user.click(sessionCardButton);
    expect(await screen.findByText(/160 kg × 4 reps/i)).toBeInTheDocument();

    store.dispose();
  });

  it('requires Joel PIN or iPhone Face ID when switching to Joel and restricts deletions to Joel only', async () => {
    const user = userEvent.setup();
    const store = new LocalRealtimeStore({ storageKey: 'test-admin-pin-faceid' });
    await store.initialize();

    // Mock WebAuthn platform authenticator for iPhone Face ID
    const mockRawId = new Uint8Array([11, 22, 33, 44, 55, 66]).buffer;
    Object.defineProperty(window, 'PublicKeyCredential', {
      value: {
        isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true),
      },
      configurable: true,
      writable: true,
    });
    Object.defineProperty(navigator, 'credentials', {
      value: {
        create: vi.fn().mockResolvedValue({ id: 'faceid-cred-1', rawId: mockRawId }),
        get: vi.fn().mockResolvedValue({ id: 'faceid-cred-1', rawId: mockRawId }),
      },
      configurable: true,
      writable: true,
    });

    render(<App store={store} mainUserStorageKey="admin-test-user" />);

    // First-visit onboarding: pick Julie (no PIN needed)
    const onboarding = await screen.findByRole('dialog', { name: /who's using this phone/i });
    await user.click(within(onboarding).getByRole('button', { name: /Julie/i }));
    expect(await screen.findByText(/Ready to lift, Julie\?/i)).toBeInTheDocument();

    // Navigate to Settings as Julie
    await user.click(screen.getByRole('tab', { name: /Settings/i }));

    // Julie CAN add a new user ("Alex") and a new exercise ("Overhead Press")
    await user.type(screen.getByLabelText('New user name'), 'Alex');
    await user.click(screen.getByRole('button', { name: 'Add User' }));
    expect(await screen.findByText(/Added Alex!/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Manage new exercise name'), 'Overhead Press');
    await user.click(screen.getByRole('button', { name: 'Add Exercise' }));
    expect(await screen.findByText('Overhead Press')).toBeInTheDocument();

    // Julie CANNOT see user delete or exercise remove buttons
    expect(screen.queryByRole('button', { name: /Delete user Alex/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Remove exercise Overhead Press/i }),
    ).not.toBeInTheDocument();

    // Store-level enforcement also blocks non-admin deletions
    const alex = store.getSnapshot().lifters.find((l) => l.name === 'Alex')!;
    const ohp = store.getSnapshot().exercises.find((e) => e.name === 'Overhead Press')!;
    await expect(store.deleteLifter(alex.id, 'lifter-julie')).rejects.toThrow(/Only Joel/i);
    await expect(store.deleteExercise(ohp.id, 'lifter-julie')).rejects.toThrow(/Only Joel/i);

    // Switch Main User to Joel -> prompts for PIN
    await user.click(screen.getByRole('button', { name: /Joel.*Requires 4-digit PIN/i }));

    // Wrong PIN is rejected
    await enterJoelKeypadPin(user, ['1', '1', '1', '1']);
    expect(await screen.findByText(/Incorrect PIN/i)).toBeInTheDocument();

    // Valid PIN unlocks Joel
    const validDigits = String(1290 * 2).split('');
    await enterJoelKeypadPin(user, validDigits);

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /switch to joel/i })).not.toBeInTheDocument();
    });

    // Now active as Joel -> can enroll iPhone Face ID
    const enableFaceIdBtn = await screen.findByRole('button', { name: /Enable Face ID/i });
    await user.click(enableFaceIdBtn);
    expect(await screen.findByText(/Face ID enabled for switching to Joel/i)).toBeInTheDocument();

    // As Joel, delete Alex and remove Overhead Press (while Joel cannot delete himself)
    expect(screen.queryByRole('button', { name: /Delete user Joel/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Delete user Alex/i }));
    await user.click(screen.getByRole('button', { name: /Confirm delete user Alex/i }));
    await waitFor(() => {
      expect(store.getSnapshot().lifters.some((l) => l.name === 'Alex')).toBe(false);
    });

    await user.click(screen.getByRole('button', { name: /Remove exercise Overhead Press/i }));
    await user.click(
      screen.getByRole('button', { name: /Confirm remove exercise Overhead Press/i }),
    );
    await waitFor(() => {
      expect(store.getSnapshot().exercises.some((e) => e.name === 'Overhead Press')).toBe(false);
    });

    // Switch to Leevi (no PIN), then switch back to Joel using enrolled Face ID!
    await user.click(screen.getByRole('button', { name: /Leevi.*Tap to switch/i }));
    await user.click(screen.getByRole('button', { name: /Joel.*Requires 4-digit PIN/i }));

    const faceIdBtn = await screen.findByRole('button', { name: /Unlock with Face ID/i });
    await user.click(faceIdBtn);

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /switch to joel/i })).not.toBeInTheDocument();
    });
    expect(navigator.credentials.get).toHaveBeenCalledTimes(1);

    store.dispose();
  });

  it('switches between Light, Dark, and Pink themes and applies Secondary App Colors', async () => {
    const user = userEvent.setup();
    const store = new LocalRealtimeStore({ storageKey: 'test-themes' });
    await store.initialize();

    // Ensure meta[name="theme-color"] exists in test document
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }

    localStorage.setItem('theme-test-user', 'lifter-julie');
    render(<App store={store} mainUserStorageKey="theme-test-user" />);

    await user.click(await screen.findByRole('tab', { name: /Settings/i }));

    const themeGroup = screen.getByRole('group', { name: /Color theme/i });
    const accentGroup = screen.getByRole('group', { name: /Secondary app color/i });

    // Default is dark + neon-green
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-accent')).toBe('neon-green');

    // Change secondary color in Dark theme to Turquoise and Bright Orange
    await user.click(within(accentGroup).getByRole('button', { name: /Turquoise/i }));
    expect(document.documentElement.getAttribute('data-accent')).toBe('turquoise');

    await user.click(within(accentGroup).getByRole('button', { name: /Bright Orange/i }));
    expect(document.documentElement.getAttribute('data-accent')).toBe('bright-orange');

    // Switch to Light theme -> secondary color selector remains active and customizable
    await user.click(within(themeGroup).getByRole('button', { name: /^Light$/i }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(meta.getAttribute('content')).toBe('#f4f7fb');

    const lightAccentGroup = screen.getByRole('group', { name: /Secondary app color/i });
    await user.click(within(lightAccentGroup).getByRole('button', { name: /Neon Green/i }));
    expect(document.documentElement.getAttribute('data-accent')).toBe('neon-green');

    // Switch to Pink / Light Pink theme
    await user.click(within(themeGroup).getByRole('button', { name: /Pink \/ Light Pink/i }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('pink');
    expect(meta.getAttribute('content')).toBe('#fff1f5');

    store.dispose();
  });

  it('tracks multi-user progression charts and personal records in the Progress tab', async () => {
    const user = userEvent.setup();
    const store = new LocalRealtimeStore({ storageKey: 'test-progress-tab' });
    await store.initialize();

    const s1 = await store.createSession({
      createdBy: 'lifter-joel',
      participantIds: ['lifter-joel', 'lifter-julie'],
      sessionDate: '2026-11-10',
      now: new Date(2026, 10, 10, 17, 0, 0),
    });
    await store.addSet({
      sessionId: s1.id,
      lifterId: 'lifter-joel',
      exerciseId: 'ex-bench-press',
      weightKg: 95,
      reps: 5,
      loggedBy: 'lifter-joel',
    });
    await store.addSet({
      sessionId: s1.id,
      lifterId: 'lifter-julie',
      exerciseId: 'ex-bench-press',
      weightKg: 52.5,
      reps: 6,
      loggedBy: 'lifter-julie',
    });
    await store.endSession(s1.id, new Date(2026, 10, 10, 18, 0, 0));

    localStorage.setItem('progress-test-user', 'lifter-julie');
    render(<App store={store} mainUserStorageKey="progress-test-user" />);

    await user.click(await screen.findByRole('tab', { name: /Progress/i }));

    expect(await screen.findByRole('img', { name: /Bench Press progression chart/i })).toBeInTheDocument();
    expect(screen.getByText('95 kg')).toBeInTheDocument();
    expect(screen.getByText('52.5 kg')).toBeInTheDocument();

    store.dispose();
  });
});
