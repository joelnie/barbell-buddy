import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { LocalRealtimeStore } from '../lib/localStore';
import { computeSessionExpiryIso, formatLocalDate } from '../lib/dates';
import {
  FINNISH_HERO_PHRASE_TEMPLATES,
  formatHeroPhrase,
  localizeExerciseName,
} from '../lib/finnish';
import { STARTER_EXERCISES } from '../lib/seedData';
import {
  getRawWeightOptionsForExercise,
  getRepsSliderStops,
  getWeightSliderStopsForExercise,
} from '../lib/sliderOptions';

async function enterJoelKeypadPin(user: ReturnType<typeof userEvent.setup>, digits: string[]) {
  const dialog = await screen.findByRole('dialog', { name: /vaihda käyttäjäksi joel/i });
  for (const d of digits) {
    await user.click(within(dialog).getByRole('button', { name: d }));
  }
}

describe('Barbell Buddy PWA (Suomi)', () => {
  it('seeds Julie (pink), Joel, Leevi, and Tuomas plus all 5 starter exercises in Finnish and migrates legacy stores', async () => {
    const store = new LocalRealtimeStore({ storageKey: 'test-seed' });
    await store.initialize();
    const snap = store.getSnapshot();

    expect(snap.lifters.map((l) => l.name)).toEqual(['Julie', 'Joel', 'Leevi', 'Tuomas']);
    expect(snap.lifters.find((l) => l.name === 'Julie')?.avatarColor).toBe('#ec4899');
    expect(snap.lifters.find((l) => l.name === 'Joel')?.isAdmin).toBe(true);
    expect(snap.exercises.map((e) => e.name)).toEqual([
      'Leuanveto',
      'Penkkipunnerrus',
      'Vinopenkki käsipainoilla',
      'Maastaveto',
      'Kyykky',
    ]);

    // Legacy localStorage store with red Julie (#f43f5e) and without Tuomas auto-migrates once
    localStorage.setItem(
      'test-legacy-migration',
      JSON.stringify({
        lifters: [
          { id: 'lifter-julie', name: 'Julie', avatarColor: '#f43f5e', isAdmin: false, createdAt: '2026-01-01T00:00:00Z' },
          { id: 'lifter-joel', name: 'Joel', avatarColor: '#10b981', isAdmin: true, createdAt: '2026-01-01T00:00:01Z' },
          { id: 'lifter-leevi', name: 'Leevi', avatarColor: '#3b82f6', isAdmin: false, createdAt: '2026-01-01T00:00:02Z' },
        ],
        exercises: STARTER_EXERCISES,
        sessions: [],
        sets: [],
      }),
    );
    const migratedStore = new LocalRealtimeStore({ storageKey: 'test-legacy-migration' });
    await migratedStore.initialize();
    const migratedLifters = migratedStore.getSnapshot().lifters;
    expect(migratedLifters.map((l) => l.name)).toEqual(['Julie', 'Joel', 'Leevi', 'Tuomas']);
    expect(migratedLifters.find((l) => l.name === 'Julie')?.avatarColor).toBe('#ec4899');
    migratedStore.dispose();

    // Existing English Supabase / localStorage exercise rows localize seamlessly to Finnish
    expect(localizeExerciseName('Pull-ups')).toBe('Leuanveto');
    expect(localizeExerciseName('Bench Press')).toBe('Penkkipunnerrus');
    expect(localizeExerciseName('Incline Dumbbell Bench Press')).toBe('Vinopenkki käsipainoilla');
    expect(localizeExerciseName('Deadlift')).toBe('Maastaveto');
    expect(localizeExerciseName('Squat')).toBe('Kyykky');

    // Weight stop matcher recognizes both English and Finnish built-in names
    expect(
      getRawWeightOptionsForExercise({
        id: 'uuid-from-supabase-1',
        name: 'Deadlift',
        category: 'barbell',
        isBuiltin: true,
        sortOrder: 4,
        createdAt: '2026-01-01T00:00:00.000Z',
      })[0],
    ).toBe(25);
    expect(
      getRawWeightOptionsForExercise({
        id: 'uuid-from-supabase-2',
        name: 'Bench Press',
        category: 'barbell',
        isBuiltin: true,
        sortOrder: 2,
        createdAt: '2026-01-01T00:00:00.000Z',
      }).slice(-1)[0],
    ).toBe(120);
    expect(
      getRawWeightOptionsForExercise({
        id: 'uuid-from-supabase-3',
        name: 'Squat',
        category: 'barbell',
        isBuiltin: true,
        sortOrder: 5,
        createdAt: '2026-01-01T00:00:00.000Z',
      }).slice(-1)[0],
    ).toBe(150);

    store.dispose();
  });

  it('includes all 22 variating Finnish motivational phrases and substitutes <user> on the idle view', async () => {
    expect(FINNISH_HERO_PHRASE_TEMPLATES).toHaveLength(22);
    expect(formatHeroPhrase('Valmiina treenaamaan, <user>?', 'Julie')).toBe(
      'Valmiina treenaamaan, Julie?',
    );
    expect(formatHeroPhrase('Näytä niille, <user>!', 'Joel')).toBe('Näytä niille, Joel!');
    expect(formatHeroPhrase('<user>, tänään liikkuu rauta!', 'Leevi')).toBe(
      'Leevi, tänään liikkuu rauta!',
    );
    expect(FINNISH_HERO_PHRASE_TEMPLATES).toContain('Sohva voi odottaa, tanko ei.');
    expect(FINNISH_HERO_PHRASE_TEMPLATES).toContain('Ei se paino itsestään nouse!');

    const store = new LocalRealtimeStore({ storageKey: 'test-hero-phrases' });
    await store.initialize();
    localStorage.setItem('phrase-user', 'lifter-julie');
    render(<App store={store} mainUserStorageKey="phrase-user" />);

    const heading = await screen.findByTestId('idle-hero-greeting');
    const validForJulie = FINNISH_HERO_PHRASE_TEMPLATES.map((t) => formatHeroPhrase(t, 'Julie'));
    expect(validForJulie).toContain(heading.textContent);

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

    // Joel starts a session for Joel + Leevi (excluding Julie) today
    const today = formatLocalDate();
    const sessionJoelLeevi = await storeJoel.createSession({
      createdBy: 'lifter-joel',
      participantIds: ['lifter-joel', 'lifter-leevi'],
      sessionDate: today,
    });

    expect(sessionJoelLeevi.participantIds).toEqual(['lifter-joel', 'lifter-leevi']);

    // Render Leevi's phone -> immediately sees the active session created by Joel!
    localStorage.setItem('leevi-main-user', 'lifter-leevi');
    const leeviView = render(
      <App store={storeLeevi} mainUserStorageKey="leevi-main-user" />,
    );
    expect(await leeviView.findByText(new RegExp(`Treeni ${today}`, 'i'))).toBeInTheDocument();
    expect(leeviView.getByRole('button', { name: /Lopeta treeni/i })).toBeInTheDocument();
    leeviView.unmount();

    // Render Julie's phone -> does NOT enter Joel+Leevi's editable session; sees "Uusi treeni" + read-only live view!
    const user = userEvent.setup();
    localStorage.setItem('julie-main-user', 'lifter-julie');
    render(<App store={storeJulie} mainUserStorageKey="julie-main-user" />);

    expect(await screen.findByTestId('idle-hero-greeting')).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(`Treeni ${today}`, 'i'))).not.toBeInTheDocument();

    // Julie opens "Uusi treeni" -> Joel & Leevi are marked busy in another active session, while Julie can start her own session!
    await user.click(screen.getByRole('button', { name: /Uusi treeni/i }));
    expect(screen.getAllByText(/Toisessa käynnissä olevassa treenissä/i)).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: /Aloita treeni \(1\)/i }));
    expect(await screen.findByText(/Lisää sarja \(Julie\)/i)).toBeInTheDocument();

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

    expect(await screen.findByText(/Ei vielä kirjattuja sarjoja/i)).toBeInTheDocument();

    // Leevi (on storeA / another phone) logs a Penkkipunnerrus set of 55 kg x 8 for Julie
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
    expect(await screen.findByText(/55 kg × 8 toistoa/i)).toBeInTheDocument();
    expect(screen.getByText(/\(kirjasi Leevi\)/i)).toBeInTheDocument();

    // Julie can also log a set for Leevi directly from her UI using the two vertical sliders
    await user.click(screen.getByRole('button', { name: 'Leevi' }));
    await user.selectOptions(screen.getByLabelText('Liike'), 'ex-squat');

    const squatEx = STARTER_EXERCISES.find((e) => e.id === 'ex-squat')!;
    const squatStops = getWeightSliderStopsForExercise(squatEx);
    const idx110 = squatStops.findIndex((s) => s.rawValue === 110);

    fireEvent.change(screen.getByRole('slider', { name: 'Paino' }), {
      target: { value: String(idx110) },
    });
    fireEvent.change(screen.getByRole('slider', { name: 'Toistot' }), {
      target: { value: '4' }, // index 4 => 5 reps
    });

    await user.click(screen.getByRole('button', { name: /Lisää sarja \(Leevi\)/i }));

    expect(await screen.findByText(/110 kg × 5 toistoa/i)).toBeInTheDocument();
    expect(storeA.getSnapshot().sets).toHaveLength(2);

    storeA.dispose();
    storeB.dispose();
  });

  it('defines exact discrete slider stops for Reps (1-20), Pull-ups (Kuminauha/Kehonpaino/+kg), Bench, Squat, Deadlift (25-180), and Dumbbells', () => {
    const repsStops = getRepsSliderStops();
    expect(repsStops).toHaveLength(20);
    expect(repsStops[0].rawValue).toBe(1);
    expect(repsStops[19].rawValue).toBe(20);

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
    const pullupStops = getWeightSliderStopsForExercise(pullups);
    expect(pullupStops[0].primaryLabel).toBe('Kuminauha');
    expect(pullupStops[1].primaryLabel).toBe('Kehonpaino');

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
        name: 'Hauiskääntö käsipainoilla',
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
        name: 'Etunojapunnerrus',
        category: 'bodyweight',
        isBuiltin: false,
        sortOrder: 100,
        createdAt: '2026-11-24T00:00:00.000Z',
      }),
    ).toEqual(['Bodyweight']);
  });

  it('renders 5-slot scrollable wheel sliders (middle highlighted, ±1 shadier, ±2 barely visible, ±3+ hidden, no range info widgets) and logs sets via drag, wheel, and +/-', async () => {
    const user = userEvent.setup();
    const store = new LocalRealtimeStore({ storageKey: 'test-pullups-sliders' });
    await store.initialize();

    localStorage.setItem('pullup-user', 'lifter-julie');
    render(<App store={store} mainUserStorageKey="pullup-user" />);

    await user.click(await screen.findByRole('button', { name: /Uusi treeni/i }));
    await user.click(screen.getByRole('button', { name: /Aloita treeni/i }));

    expect(screen.getByLabelText('Liike')).toHaveValue('ex-pullups');

    // Info range widgets ("1–30", "Kumi–+30") are dropped
    expect(screen.queryByText('1–30')).not.toBeInTheDocument();
    expect(screen.queryByText('Kumi–+30')).not.toBeInTheDocument();

    const repsSlider = screen.getByRole('slider', { name: 'Toistot' });
    const weightSlider = screen.getByRole('slider', { name: 'Paino' });
    const repsTrack = screen.getByTestId('reps-slider-track');
    const weightTrack = screen.getByTestId('weight-slider-track');

    // Default for Leuanveto when user has no history yet: Kehonpaino (index 1) and 8 toistoa (index 7)
    expect(weightSlider).toHaveAttribute('aria-valuetext', 'Kehonpaino');
    expect(repsSlider).toHaveAttribute('aria-valuetext', '8 toistoa');

    // Verify 5-slot wheel visibility tiers around 8 toistoa:
    // offset 0 ("8") => middle highlighted (opacity 1)
    // offset ±1 ("9", "7") => shadier (opacity 0.5)
    // offset ±2 ("10", "6") => barely visible (opacity 0.18)
    // offset ±3 ("11", "5") => not visible / not rendered
    const slot0 = repsTrack.querySelector('[data-wheel-offset="0"]') as HTMLElement;
    const slotPlus1 = repsTrack.querySelector('[data-wheel-offset="1"]') as HTMLElement;
    const slotMinus1 = repsTrack.querySelector('[data-wheel-offset="-1"]') as HTMLElement;
    const slotPlus2 = repsTrack.querySelector('[data-wheel-offset="2"]') as HTMLElement;
    const slotMinus2 = repsTrack.querySelector('[data-wheel-offset="-2"]') as HTMLElement;
    expect(slot0).toHaveTextContent('8');
    expect(slot0.style.opacity).toBe('1');
    expect(slotPlus1).toHaveTextContent('9');
    expect(slotPlus1.style.opacity).toBe('0.5');
    expect(slotMinus1).toHaveTextContent('7');
    expect(slotMinus1.style.opacity).toBe('0.5');
    expect(slotPlus2).toHaveTextContent('10');
    expect(slotPlus2.style.opacity).toBe('0.18');
    expect(slotMinus2).toHaveTextContent('6');
    expect(slotMinus2.style.opacity).toBe('0.18');
    expect(repsTrack.querySelector('[data-wheel-offset="3"]')).toBeNull();
    expect(repsTrack.querySelector('[data-wheel-offset="-3"]')).toBeNull();

    // 1. Step down 1 notch on Paino -> Kuminauha (index 0); scroll wheel + button on Toistot -> 10 toistoa
    await user.click(screen.getByRole('button', { name: 'Vähennä painoa' }));
    expect(weightSlider).toHaveAttribute('aria-valuetext', 'Kuminauha');
    fireEvent.wheel(repsTrack, { deltaY: -40 });
    expect(repsSlider).toHaveAttribute('aria-valuetext', '9 toistoa');
    await user.click(screen.getByRole('button', { name: 'Lisää toistoja' }));
    expect(repsSlider).toHaveAttribute('aria-valuetext', '10 toistoa');

    await user.click(screen.getByRole('button', { name: /Lisää sarja \(Julie\)/i }));
    expect(await screen.findByText(/Kuminauha × 10 toistoa/i)).toBeInTheDocument();

    // 2. Step up 1 notch on Paino -> Kehonpaino (index 1), set Toistot to 7 (index 6)
    await user.click(screen.getByRole('button', { name: 'Lisää painoa' }));
    expect(weightSlider).toHaveAttribute('aria-valuetext', 'Kehonpaino');
    fireEvent.change(repsSlider, { target: { value: '6' } });
    await user.click(screen.getByRole('button', { name: /Lisää sarja \(Julie\)/i }));
    expect(await screen.findByText(/Kehonpaino × 7 toistoa/i)).toBeInTheDocument();

    // 3. Weighted Pull-ups via vertical touch-drag scrolling on the wheel!
    // Currently at index 1 (Kehonpaino). Dragging downward by +200px (5 * 40px rows) scrolls to index 6 (+12.5 kg).
    expect(weightTrack).toHaveClass('touch-none', 'bb-slider-track');
    fireEvent.pointerDown(weightTrack, { pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(weightTrack, { pointerId: 1, clientY: 300 });
    fireEvent.pointerUp(weightTrack, { pointerId: 1, clientY: 300 });

    expect(weightSlider).toHaveAttribute('aria-valuetext', '+12.5 kg');
    fireEvent.change(repsSlider, { target: { value: '4' } }); // 5 reps
    await user.click(screen.getByRole('button', { name: /Lisää sarja \(Julie\)/i }));
    expect(await screen.findByText(/\+12\.5 kg × 5 toistoa/i)).toBeInTheDocument();

    // 4. Switch to Maastaveto -> minimum stop is 25 kg (index 0), top stop is 180 kg (index 62)
    await user.selectOptions(screen.getByLabelText('Liike'), 'ex-deadlift');
    fireEvent.change(weightSlider, { target: { value: '0' } });
    expect(weightSlider).toHaveAttribute('aria-valuetext', '25 kg');
    fireEvent.change(weightSlider, { target: { value: '62' } });
    expect(weightSlider).toHaveAttribute('aria-valuetext', '180 kg');

    // Switch back to Leuanveto -> smartly snaps back to Julie's last Pull-up set (+12.5 kg x 5 toistoa)
    await user.selectOptions(screen.getByLabelText('Liike'), 'ex-pullups');
    expect(weightSlider).toHaveAttribute('aria-valuetext', '+12.5 kg');
    expect(repsSlider).toHaveAttribute('aria-valuetext', '5 toistoa');

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
    ).rejects.toThrow(/0 kg|negatiivisia/i);

    store.dispose();
  });

  it('auto-saves and finalizes unended sessions at 23:59 local time and displays sets in Historia', async () => {
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

    // Just after 23:59:59, sweep finalizes the session automatically without pressing Lopeta treeni
    const sweptAfter = await store.sweepExpiredSessions(new Date(2026, 10, 21, 0, 0, 1));
    expect(sweptAfter).toBe(1);
    expect(store.getSnapshot().sessions[0].status).toBe('completed');
    expect(store.getSnapshot().sessions[0].endedAt).toBe(session.expiresAt);

    // Open Historia tab, inspect the 2026-11-20 session, and test deleting old sessions with "Oletko varma?" confirmation
    localStorage.setItem('history-user', 'lifter-julie');
    render(<App store={store} mainUserStorageKey="history-user" />);

    // Idle Uusi treeni card must NOT show "valmista tänään" even if a session was completed today
    await act(async () => {
      const todayCompleted = await store.createSession({
        createdBy: 'lifter-julie',
        participantIds: ['lifter-julie'],
      });
      await store.endSession(todayCompleted.id);
    });
    expect(screen.queryByText(/valmista tänään/i)).not.toBeInTheDocument();

    await user.click(await screen.findByRole('tab', { name: /Historia/i }));

    const sessionCardButton = await screen.findByRole('button', { name: /2026-11-20/i });
    await user.click(sessionCardButton);
    expect(await screen.findByText(/160 kg × 4 toistoa/i)).toBeInTheDocument();

    // Delete the 2026-11-20 session via "Oletko varma?" confirmation
    const cardArticle = sessionCardButton.closest('article')!;
    await user.click(within(cardArticle).getByRole('button', { name: 'Poista treeni' }));
    expect(within(cardArticle).getByText(/Oletko varma\?/i)).toBeInTheDocument();

    // Cancel keeps the session
    await user.click(within(cardArticle).getByRole('button', { name: 'Peruuta' }));
    expect(within(cardArticle).queryByText(/Oletko varma\?/i)).not.toBeInTheDocument();

    // Confirm soft-deletes the session from Historia while preserving sets for admin restoration
    await user.click(within(cardArticle).getByRole('button', { name: 'Poista treeni' }));
    await user.click(within(cardArticle).getByRole('button', { name: 'Poista' }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /2026-11-20/i })).not.toBeInTheDocument();
    });
    expect(
      store.getSnapshot().sessions.find((s) => s.id === session.id)?.deletedAt,
    ).toBeTruthy();
    expect(store.getSnapshot().sets).toHaveLength(1);

    store.dispose();
  });

  it('requires Joel PIN (without Face ID) when switching to Joel and restricts user/exercise deletions to Joel only', async () => {
    const user = userEvent.setup();
    const store = new LocalRealtimeStore({ storageKey: 'test-admin-pin-only' });
    await store.initialize();

    render(<App store={store} mainUserStorageKey="admin-test-user" />);

    // First-visit onboarding: pick Julie (no PIN needed) and verify Face ID text is gone
    const onboarding = await screen.findByRole('dialog', { name: /kuka käyttää tätä puhelinta/i });
    expect(within(onboarding).queryByText(/Face ID/i)).not.toBeInTheDocument();
    await user.click(within(onboarding).getByRole('button', { name: /Julie/i }));
    expect(await screen.findByTestId('idle-hero-greeting')).toBeInTheDocument();

    // Navigate to Asetukset as Julie
    await user.click(screen.getByRole('tab', { name: /Asetukset/i }));
    expect(screen.queryByText(/Face ID/i)).not.toBeInTheDocument();

    // Julie CAN add a new user ("Alex") and a new exercise ("Pystypunnerrus")
    await user.type(screen.getByLabelText('Uuden käyttäjän nimi'), 'Alex');
    await user.click(screen.getByRole('button', { name: 'Lisää käyttäjä' }));
    expect(await screen.findByText(/Lisättiin Alex!/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Hallittavan uuden liikkeen nimi'), 'Pystypunnerrus');
    await user.click(screen.getByRole('button', { name: 'Lisää liike' }));
    expect(await screen.findByText('Pystypunnerrus')).toBeInTheDocument();

    // Julie CANNOT see user delete or exercise remove buttons
    expect(screen.queryByRole('button', { name: /Poista käyttäjä Alex/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Poista liike Pystypunnerrus/i }),
    ).not.toBeInTheDocument();

    // Store-level enforcement also blocks non-admin deletions
    const alex = store.getSnapshot().lifters.find((l) => l.name === 'Alex')!;
    const ohp = store.getSnapshot().exercises.find((e) => e.name === 'Pystypunnerrus')!;
    await expect(store.deleteLifter(alex.id, 'lifter-julie')).rejects.toThrow(/Vain Joel/i);
    await expect(store.deleteExercise(ohp.id, 'lifter-julie')).rejects.toThrow(/Vain Joel/i);

    // Switch Main User to Joel -> prompts for PIN
    await user.click(screen.getByRole('button', { name: /Joel.*Vaatii 4-numeroisen PIN-koodin/i }));

    // Wrong PIN is rejected
    await enterJoelKeypadPin(user, ['1', '1', '1', '1']);
    expect(await screen.findByText(/Väärä PIN-koodi/i)).toBeInTheDocument();

    // Valid PIN unlocks Joel
    const validDigits = String(1290 * 2).split('');
    await enterJoelKeypadPin(user, validDigits);

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: /vaihda käyttäjäksi joel/i }),
      ).not.toBeInTheDocument();
    });
    expect(screen.queryByText(/Face ID/i)).not.toBeInTheDocument();

    // As Joel, delete Alex and remove Pystypunnerrus (while Joel cannot delete himself)
    expect(screen.queryByRole('button', { name: /Poista käyttäjä Joel/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Poista käyttäjä Alex/i }));
    await user.click(screen.getByRole('button', { name: /Vahvista käyttäjän Alex poisto/i }));
    await waitFor(() => {
      expect(store.getSnapshot().lifters.some((l) => l.name === 'Alex')).toBe(false);
    });

    await user.click(screen.getByRole('button', { name: /Poista liike Pystypunnerrus/i }));
    await user.click(
      screen.getByRole('button', { name: /Vahvista liikkeen Pystypunnerrus poisto/i }),
    );
    await waitFor(() => {
      expect(store.getSnapshot().exercises.some((e) => e.name === 'Pystypunnerrus')).toBe(false);
    });

    store.dispose();
  });

  it('switches between Vaalea, Tumma, and Pinkki themes and displays concise Korostusväri label', async () => {
    const user = userEvent.setup();
    const store = new LocalRealtimeStore({ storageKey: 'test-themes' });
    await store.initialize();

    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }

    localStorage.setItem('theme-test-user', 'lifter-julie');
    render(<App store={store} mainUserStorageKey="theme-test-user" />);

    await user.click(await screen.findByRole('tab', { name: /Asetukset/i }));

    expect(screen.getByText('Korostusväri')).toBeInTheDocument();
    expect(
      screen.queryByText('Korostusväri (korttien reunukset ja tehosteet)'),
    ).not.toBeInTheDocument();

    const themeGroup = screen.getByRole('group', { name: /Väriteema/i });
    const accentGroup = screen.getByRole('group', { name: /Sovelluksen korostusväri/i });

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-accent')).toBe('neon-green');

    await user.click(within(accentGroup).getByRole('button', { name: /Turkoosi/i }));
    expect(document.documentElement.getAttribute('data-accent')).toBe('turquoise');

    await user.click(within(accentGroup).getByRole('button', { name: /Kirkkaanoranssi/i }));
    expect(document.documentElement.getAttribute('data-accent')).toBe('bright-orange');

    await user.click(within(themeGroup).getByRole('button', { name: /^Vaalea$/i }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(meta.getAttribute('content')).toBe('#f4f7fb');

    const lightAccentGroup = screen.getByRole('group', { name: /Sovelluksen korostusväri/i });
    await user.click(within(lightAccentGroup).getByRole('button', { name: /Neonvihreä/i }));
    expect(document.documentElement.getAttribute('data-accent')).toBe('neon-green');

    await user.click(within(themeGroup).getByRole('button', { name: /^Pinkki$/i }));
    expect(
      within(themeGroup).queryByRole('button', { name: /Vaaleanpunainen/i }),
    ).not.toBeInTheDocument();
    expect(document.documentElement.getAttribute('data-theme')).toBe('pink');
    expect(meta.getAttribute('content')).toBe('#fff1f5');

    store.dispose();
  });

  it('tracks multi-user progression charts and personal records in the Kehitys tab', async () => {
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

    await user.click(await screen.findByRole('tab', { name: /Kehitys/i }));

    expect(
      await screen.findByRole('img', { name: /Liikkeen Penkkipunnerrus kehityskaavio/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('95 kg')).toBeInTheDocument();
    expect(screen.getByText('52.5 kg')).toBeInTheDocument();

    store.dispose();
  });

  it('defaults sliders in a new session to each user’s last-session reps and weights', async () => {
    const user = userEvent.setup();
    const store = new LocalRealtimeStore({ storageKey: 'test-per-user-last-defaults' });
    await store.initialize();

    // Previous completed session from last week
    const prev = await store.createSession({
      createdBy: 'lifter-joel',
      participantIds: ['lifter-joel', 'lifter-julie'],
      sessionDate: '2026-11-17',
      now: new Date(2026, 10, 17, 17, 0, 0),
    });
    await store.addSet({
      sessionId: prev.id,
      lifterId: 'lifter-joel',
      exerciseId: 'ex-pullups',
      pullupMode: 'weighted',
      weightKg: 17.5,
      reps: 6,
      loggedBy: 'lifter-joel',
    });
    await store.addSet({
      sessionId: prev.id,
      lifterId: 'lifter-julie',
      exerciseId: 'ex-pullups',
      pullupMode: 'assisted',
      weightKg: null,
      reps: 11,
      loggedBy: 'lifter-joel',
    });
    await store.addSet({
      sessionId: prev.id,
      lifterId: 'lifter-joel',
      exerciseId: 'ex-bench-press',
      weightKg: 97.5,
      reps: 4,
      loggedBy: 'lifter-joel',
    });
    await store.addSet({
      sessionId: prev.id,
      lifterId: 'lifter-julie',
      exerciseId: 'ex-bench-press',
      weightKg: 52.5,
      reps: 9,
      loggedBy: 'lifter-julie',
    });
    await store.endSession(prev.id, new Date(2026, 10, 17, 18, 0, 0));

    // Start a brand-new session today with Joel + Julie
    localStorage.setItem('defaults-user', 'lifter-joel');
    render(<App store={store} mainUserStorageKey="defaults-user" />);

    await user.click(await screen.findByRole('button', { name: /Uusi treeni/i }));
    await user.click(screen.getByRole('button', { name: /Julie/i }));
    await user.click(screen.getByRole('button', { name: /Aloita treeni \(2\)/i }));

    const repsSlider = screen.getByRole('slider', { name: 'Toistot' });
    const weightSlider = screen.getByRole('slider', { name: 'Paino' });

    // Immediately defaults to Joel's last Leuanveto (+17.5 kg x 6)
    expect(weightSlider).toHaveAttribute('aria-valuetext', '+17.5 kg');
    expect(repsSlider).toHaveAttribute('aria-valuetext', '6 toistoa');

    // Switch lifter to Julie -> immediately defaults to Julie's last Leuanveto (Kuminauha x 11)
    await user.click(screen.getByRole('button', { name: 'Julie' }));
    expect(weightSlider).toHaveAttribute('aria-valuetext', 'Kuminauha');
    expect(repsSlider).toHaveAttribute('aria-valuetext', '11 toistoa');

    // Switch exercise to Penkkipunnerrus -> defaults to Julie's last Penkkipunnerrus (52.5 kg x 9)
    await user.selectOptions(screen.getByLabelText('Liike'), 'ex-bench-press');
    expect(weightSlider).toHaveAttribute('aria-valuetext', '52.5 kg');
    expect(repsSlider).toHaveAttribute('aria-valuetext', '9 toistoa');

    // Switch lifter back to Joel -> defaults to Joel's last Penkkipunnerrus (97.5 kg x 4)
    await user.click(screen.getByRole('button', { name: 'Joel' }));
    expect(weightSlider).toHaveAttribute('aria-valuetext', '97.5 kg');
    expect(repsSlider).toHaveAttribute('aria-valuetext', '4 toistoa');

    // Switch exercise to Vinopenkki käsipainoilla -> Weight slider label updates to "Paino (x2)"
    await user.selectOptions(screen.getByLabelText('Liike'), 'ex-incline-db-bench');
    expect(screen.getByRole('slider', { name: 'Paino (x2)' })).toBeInTheDocument();

    // Store enforces max 20 reps
    await expect(
      store.addSet({
        sessionId: store.getSnapshot().sessions[0].id,
        lifterId: 'lifter-joel',
        exerciseId: 'ex-bench-press',
        weightKg: 80,
        reps: 21,
        loggedBy: 'lifter-joel',
      }),
    ).rejects.toThrow(/1–20/);

    store.dispose();
  });

  it('allows idle non-participants to live-inspect Julie’s ongoing solo workout in Treeni (read-only) while keeping it out of Historia until ended', async () => {
    const user = userEvent.setup();
    const sharedStorageKey = 'test-live-inspect-idle';
    const channelName = 'test-live-inspect-idle-chan';

    const storeJulie = new LocalRealtimeStore({ storageKey: sharedStorageKey, channelName });
    const storeJoel = new LocalRealtimeStore({ storageKey: sharedStorageKey, channelName });
    await Promise.all([storeJulie.initialize(), storeJoel.initialize()]);

    // Julie starts an active solo workout and logs her first set
    const julieSession = await storeJulie.createSession({
      createdBy: 'lifter-julie',
      participantIds: ['lifter-julie'],
    });
    await storeJulie.addSet({
      sessionId: julieSession.id,
      lifterId: 'lifter-julie',
      exerciseId: 'ex-pullups',
      pullupMode: 'assisted',
      weightKg: null,
      reps: 10,
      loggedBy: 'lifter-julie',
    });

    // Render Joel's phone (idle in Treeni tab)
    localStorage.setItem('inspect-joel-user', 'lifter-joel');
    render(<App store={storeJoel} mainUserStorageKey="inspect-joel-user" />);

    // Joel still sees his own "Uusi treeni" button AND sees Julie's live workout expanded by default
    expect(await screen.findByRole('button', { name: /Uusi treeni/i })).toBeInTheDocument();

    const liveSection = screen.getByTestId('live-other-workouts-section');
    const toggleBtn = within(liveSection).getByRole('button', { name: /Käynnissä nyt/i });
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'true');
    expect(within(liveSection).getByText('LIVE')).toBeInTheDocument();
    expect(within(liveSection).getByText('Vain luku')).toBeInTheDocument();

    const julieCard = within(liveSection).getByTestId(`live-session-card-${julieSession.id}`);
    expect(within(julieCard).getAllByText('Julie').length).toBeGreaterThan(0);
    expect(within(julieCard).getByText(/Kuminauha × 10 toistoa/i)).toBeInTheDocument();

    // Strictly read-only: zero buttons inside Julie's inspected card, and no mutation controls anywhere
    expect(within(julieCard).queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /Lisää sarja/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Muokkaa/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Poista/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Lisää treenaaja/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Lopeta treeni/i })).not.toBeInTheDocument();

    // Julie logs a new set in real time -> appears live in Joel's read-only inspection view
    await act(async () => {
      await storeJulie.addSet({
        sessionId: julieSession.id,
        lifterId: 'lifter-julie',
        exerciseId: 'ex-bench-press',
        weightKg: 52.5,
        reps: 8,
        loggedBy: 'lifter-julie',
      });
    });

    expect(await within(julieCard).findByText(/52\.5 kg × 8 toistoa/i)).toBeInTheDocument();
    expect(within(julieCard).getByText('2 sarjaa')).toBeInTheDocument();

    // Ongoing session must NOT appear in Historia until ended
    await user.click(screen.getByRole('tab', { name: /Historia/i }));
    expect(await screen.findByText(/Ei vielä valmiita treenejä/i)).toBeInTheDocument();
    expect(screen.queryByText(/52\.5 kg × 8 toistoa/i)).not.toBeInTheDocument();

    // Once Julie ends her session, it moves to Historia and leaves Käynnissä nyt
    await act(async () => {
      await storeJulie.endSession(julieSession.id);
    });
    const completedCardBtn = await screen.findByRole('button', {
      name: new RegExp(julieSession.sessionDate),
    });
    await user.click(completedCardBtn);
    expect(await screen.findByText(/52\.5 kg × 8 toistoa/i)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /Treeni/i }));
    expect(screen.queryByTestId('live-other-workouts-section')).not.toBeInTheDocument();

    storeJulie.dispose();
    storeJoel.dispose();
  });

  it('allows a user in their own active session to inspect another user’s ongoing workout (collapsed by default) without mixing sets or controls', async () => {
    const user = userEvent.setup();
    const sharedStorageKey = 'test-live-inspect-parallel';
    const channelName = 'test-live-inspect-parallel-chan';

    const storeJulie = new LocalRealtimeStore({ storageKey: sharedStorageKey, channelName });
    const storeLeevi = new LocalRealtimeStore({ storageKey: sharedStorageKey, channelName });
    await Promise.all([storeJulie.initialize(), storeLeevi.initialize()]);

    // Julie has her own active session
    const julieSession = await storeJulie.createSession({
      createdBy: 'lifter-julie',
      participantIds: ['lifter-julie'],
    });
    await storeJulie.addSet({
      sessionId: julieSession.id,
      lifterId: 'lifter-julie',
      exerciseId: 'ex-squat',
      weightKg: 75,
      reps: 6,
      loggedBy: 'lifter-julie',
    });

    // Leevi has his own separate active session on the same day
    const leeviSession = await storeLeevi.createSession({
      createdBy: 'lifter-leevi',
      participantIds: ['lifter-leevi'],
    });
    await storeLeevi.addSet({
      sessionId: leeviSession.id,
      lifterId: 'lifter-leevi',
      exerciseId: 'ex-deadlift',
      weightKg: 150,
      reps: 5,
      loggedBy: 'lifter-leevi',
    });

    localStorage.setItem('parallel-leevi-user', 'lifter-leevi');
    render(<App store={storeLeevi} mainUserStorageKey="parallel-leevi-user" />);

    // Leevi sees his own active session sets and controls, without Julie's sets mixed in
    expect(await screen.findByText(/150 kg × 5 toistoa/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Lisää sarja \(Leevi\)/i })).toBeInTheDocument();
    expect(screen.queryByText(/75 kg × 6 toistoa/i)).not.toBeInTheDocument();

    // Below Leevi's session feed, Käynnissä nyt is collapsed by default so it stays out of the way
    const liveSection = screen.getByTestId('live-other-workouts-section');
    const toggleBtn = within(liveSection).getByRole('button', { name: /Käynnissä nyt/i });
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');

    // Expanding Käynnissä nyt reveals Julie's ongoing workout in read-only mode
    await user.click(toggleBtn);
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'true');

    const julieCard = within(liveSection).getByTestId(`live-session-card-${julieSession.id}`);
    expect(within(julieCard).getByText(/75 kg × 6 toistoa/i)).toBeInTheDocument();
    expect(within(julieCard).queryByText(/150 kg × 5 toistoa/i)).not.toBeInTheDocument();
    expect(within(julieCard).queryAllByRole('button')).toHaveLength(0);

    storeJulie.dispose();
    storeLeevi.dispose();
  });

  it('allows only Joel (admin) to view and restore sessions deleted from Historia, restoring sets to Historia and Kehitys', async () => {
    const user = userEvent.setup();
    const store = new LocalRealtimeStore({ storageKey: 'test-admin-restore-session' });
    await store.initialize();

    // Create and finish a session with Bench Press PR for Julie
    const sess = await store.createSession({
      createdBy: 'lifter-julie',
      participantIds: ['lifter-julie'],
      sessionDate: '2026-11-18',
      now: new Date(2026, 10, 18, 17, 0, 0),
    });
    await store.addSet({
      sessionId: sess.id,
      lifterId: 'lifter-julie',
      exerciseId: 'ex-bench-press',
      weightKg: 57.5,
      reps: 6,
      loggedBy: 'lifter-julie',
    });
    await store.endSession(sess.id, new Date(2026, 10, 18, 18, 0, 0));

    localStorage.setItem('restore-test-user', 'lifter-julie');
    render(<App store={store} mainUserStorageKey="restore-test-user" />);

    // Verify PR appears in Kehitys before deletion
    await user.click(await screen.findByRole('tab', { name: /Kehitys/i }));
    expect(await screen.findByText('57.5 kg')).toBeInTheDocument();

    // Delete the session from Historia as Julie
    await user.click(screen.getByRole('tab', { name: /Historia/i }));
    const sessionBtn = await screen.findByRole('button', { name: /2026-11-18/i });
    const cardArticle = sessionBtn.closest('article')!;
    await user.click(within(cardArticle).getByRole('button', { name: 'Poista treeni' }));
    expect(
      within(cardArticle).getByText(/Oletko varma\? Poistetaanko treeni historiasta\?/i),
    ).toBeInTheDocument();
    await user.click(within(cardArticle).getByRole('button', { name: 'Poista' }));

    // Session disappears from Historia AND from Kehitys
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /2026-11-18/i })).not.toBeInTheDocument();
    });
    // Non-admin Julie cannot see Poistetut treenit or restore via store
    expect(screen.queryByTestId('deleted-sessions-section')).not.toBeInTheDocument();
    await expect(store.restoreSession(sess.id, 'lifter-julie')).rejects.toThrow(/Vain Joel/i);

    await user.click(screen.getByRole('tab', { name: /Kehitys/i }));
    expect(screen.queryByText('57.5 kg')).not.toBeInTheDocument();

    // Switch to Joel (admin) via PIN
    await user.click(screen.getByRole('tab', { name: /Asetukset/i }));
    await user.click(screen.getByRole('button', { name: /Joel.*Vaatii 4-numeroisen PIN-koodin/i }));
    await enterJoelKeypadPin(user, String(1290 * 2).split(''));
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: /vaihda käyttäjäksi joel/i }),
      ).not.toBeInTheDocument();
    });

    // Open Historia as Joel -> sees Poistetut treenit and restores 2026-11-18
    await user.click(screen.getByRole('tab', { name: /Historia/i }));
    const deletedSection = await screen.findByTestId('deleted-sessions-section');
    const deletedCard = within(deletedSection).getByTestId(`deleted-session-card-${sess.id}`);
    expect(within(deletedCard).getByText('2026-11-18')).toBeInTheDocument();
    expect(within(deletedCard).getByText('1 sarja')).toBeInTheDocument();

    await user.click(
      within(deletedCard).getByRole('button', { name: /Palauta treeni 2026-11-18/i }),
    );

    // Deleted section disappears and the restored session + its set are back in Historia and Kehitys
    await waitFor(() => {
      expect(screen.queryByTestId('deleted-sessions-section')).not.toBeInTheDocument();
    });
    const restoredBtn = await screen.findByRole('button', { name: /2026-11-18/i });
    await user.click(restoredBtn);
    expect(await screen.findByText(/57\.5 kg × 6 toistoa/i)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /Kehitys/i }));
    expect(await screen.findByText('57.5 kg')).toBeInTheDocument();

    store.dispose();
  });

  it('allows only Joel (admin) to rename exercises and applies the new name across Asetukset, Treeni, and Historia', async () => {
    const user = userEvent.setup();
    const store = new LocalRealtimeStore({ storageKey: 'test-admin-rename-exercise' });
    await store.initialize();

    const bulgarian = await store.addExercise({
      name: 'Bulgarialainen kyykky',
      category: 'dumbbell',
    });

    // Log a historical session with Bulgarialainen kyykky
    const pastSess = await store.createSession({
      createdBy: 'lifter-julie',
      participantIds: ['lifter-julie'],
      sessionDate: '2026-11-19',
      now: new Date(2026, 10, 19, 17, 0, 0),
    });
    await store.addSet({
      sessionId: pastSess.id,
      lifterId: 'lifter-julie',
      exerciseId: bulgarian.id,
      weightKg: 16,
      reps: 10,
      loggedBy: 'lifter-julie',
    });
    await store.endSession(pastSess.id, new Date(2026, 10, 19, 18, 0, 0));

    // Also start an active session for Joel with Bulgarialainen kyykky
    const liveSess = await store.createSession({
      createdBy: 'lifter-joel',
      participantIds: ['lifter-joel'],
    });
    await store.addSet({
      sessionId: liveSess.id,
      lifterId: 'lifter-joel',
      exerciseId: bulgarian.id,
      weightKg: 24,
      reps: 8,
      loggedBy: 'lifter-joel',
    });

    localStorage.setItem('rename-test-user', 'lifter-julie');
    render(<App store={store} mainUserStorageKey="rename-test-user" />);

    // Non-admin Julie cannot see rename buttons or rename via store
    await user.click(await screen.findByRole('tab', { name: /Asetukset/i }));
    expect(
      screen.queryByRole('button', { name: /Muokkaa liikkeen Bulgarialainen kyykky nimeä/i }),
    ).not.toBeInTheDocument();
    await expect(
      store.renameExercise(bulgarian.id, 'Bulgarialainen kyykky (kp)', 'lifter-julie'),
    ).rejects.toThrow(/Vain Joel/i);

    // Switch to Joel (admin)
    await user.click(screen.getByRole('button', { name: /Joel.*Vaatii 4-numeroisen PIN-koodin/i }));
    await enterJoelKeypadPin(user, String(1290 * 2).split(''));
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: /vaihda käyttäjäksi joel/i }),
      ).not.toBeInTheDocument();
    });

    // Click rename pencil for Bulgarialainen kyykky
    await user.click(
      screen.getByRole('button', { name: /Muokkaa liikkeen Bulgarialainen kyykky nimeä/i }),
    );
    const renameInput = screen.getByLabelText(/Uusi nimi liikkeelle Bulgarialainen kyykky/i);

    // Rejects duplicate name (e.g. "Kyykky")
    await user.clear(renameInput);
    await user.type(renameInput, 'Kyykky');
    await user.click(
      screen.getByRole('button', { name: /Tallenna liikkeen Bulgarialainen kyykky nimi/i }),
    );
    expect(await screen.findByText(/Liike "Kyykky" on jo olemassa/i)).toBeInTheDocument();

    // Save valid new name: "Bulgarialainen kyykky (kp)"
    await user.clear(renameInput);
    await user.type(renameInput, 'Bulgarialainen kyykky (kp)');
    await user.click(
      screen.getByRole('button', { name: /Tallenna liikkeen Bulgarialainen kyykky nimi/i }),
    );

    expect(
      await screen.findByText(/Liikkeen nimi päivitetty: Bulgarialainen kyykky \(kp\)/i),
    ).toBeInTheDocument();
    expect(screen.getByText('Bulgarialainen kyykky (kp)')).toBeInTheDocument();

    // Verify active session in Treeni shows the updated exercise name
    await user.click(screen.getByRole('tab', { name: /Treeni/i }));
    expect(await screen.findByRole('heading', { name: 'Bulgarialainen kyykky (kp)' })).toBeInTheDocument();

    // Verify historical session in Historia also shows "Bulgarialainen kyykky (kp)"
    await user.click(screen.getByRole('tab', { name: /Historia/i }));
    const historyCardBtn = await screen.findByRole('button', { name: /2026-11-19/i });
    expect(historyCardBtn).toHaveTextContent('Bulgarialainen kyykky (kp)');
    await user.click(historyCardBtn);
    expect(
      await screen.findByRole('heading', { name: 'Bulgarialainen kyykky (kp)' }),
    ).toBeInTheDocument();

    store.dispose();
  });
});
