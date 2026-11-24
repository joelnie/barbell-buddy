import { useEffect, useMemo, useState } from 'react';
import { Award, TrendingUp } from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  computeProgressionByLifter,
  formatWeightNumber,
  type WeightedProgressMetric,
} from '../lib/metrics';
import type { PullupMode } from '../types/models';

export function ProgressTab() {
  const { snapshot } = useApp();

  const [selectedExerciseId, setSelectedExerciseId] = useState<string>('');
  const [pullupMode, setPullupMode] = useState<PullupMode>('bodyweight');
  const [weightedMetric, setWeightedMetric] = useState<WeightedProgressMetric>('topWeight');
  const [visibleLifterIds, setVisibleLifterIds] = useState<string[]>([]);

  useEffect(() => {
    if (snapshot.exercises.length === 0) return;
    if (!selectedExerciseId || !snapshot.exercises.some((e) => e.id === selectedExerciseId)) {
      const bench = snapshot.exercises.find((e) => e.name === 'Bench Press');
      setSelectedExerciseId((bench ?? snapshot.exercises[0]).id);
    }
  }, [snapshot.exercises, selectedExerciseId]);

  useEffect(() => {
    setVisibleLifterIds((prev) => {
      const validIds = snapshot.lifters.map((l) => l.id);
      if (prev.length === 0) return validIds;
      const kept = prev.filter((id) => validIds.includes(id));
      return kept.length > 0 ? kept : validIds;
    });
  }, [snapshot.lifters]);

  const selectedExercise = useMemo(
    () => snapshot.exercises.find((e) => e.id === selectedExerciseId) ?? snapshot.exercises[0],
    [snapshot.exercises, selectedExerciseId],
  );

  const toggleLifterVisibility = (lifterId: string) => {
    setVisibleLifterIds((prev) => {
      if (prev.includes(lifterId)) {
        if (prev.length === 1) return prev;
        return prev.filter((id) => id !== lifterId);
      }
      return [...prev, lifterId];
    });
  };

  const progression = useMemo(() => {
    if (!selectedExercise) return null;
    return computeProgressionByLifter({
      sessions: snapshot.sessions,
      sets: snapshot.sets,
      exercise: selectedExercise,
      lifterIds: snapshot.lifters.map((l) => l.id),
      pullupMode,
      weightedMetric,
    });
  }, [snapshot.sessions, snapshot.sets, snapshot.lifters, selectedExercise, pullupMode, weightedMetric]);

  if (!selectedExercise || !progression) {
    return null;
  }

  const allDates = Array.from(
    new Set(
      visibleLifterIds.flatMap((id) =>
        (progression.seriesByLifter[id] ?? []).map((pt) => pt.sessionDate),
      ),
    ),
  ).sort((a, b) => a.localeCompare(b));

  const allValues = visibleLifterIds.flatMap((id) =>
    (progression.seriesByLifter[id] ?? []).map((pt) => pt.value),
  );

  const hasChartData = allValues.length > 0;
  const minVal = hasChartData ? Math.min(...allValues) : 0;
  const maxVal = hasChartData ? Math.max(...allValues) : 100;
  const yMin = Math.max(0, Math.floor(minVal * 0.85));
  const yMax = maxVal === yMin ? yMin + 10 : Math.ceil(maxVal * 1.1);

  const chartWidth = 340;
  const chartHeight = 185;
  const padLeft = 38;
  const padRight = 16;
  const padTop = 16;
  const padBottom = 30;
  const plotW = chartWidth - padLeft - padRight;
  const plotH = chartHeight - padTop - padBottom;

  const xForDate = (dateStr: string): number => {
    if (allDates.length <= 1) return padLeft + plotW / 2;
    const idx = allDates.indexOf(dateStr);
    return padLeft + (idx / (allDates.length - 1)) * plotW;
  };

  const yForValue = (v: number): number => {
    const ratio = (v - yMin) / Math.max(1, yMax - yMin);
    return padTop + plotH - ratio * plotH;
  };

  const showWeightedMetricToggle =
    selectedExercise.category !== 'bodyweight' &&
    (selectedExercise.category !== 'pullup' || pullupMode === 'weighted');

  return (
    <div className="space-y-4">
      {/* Controls Card */}
      <section className="bb-widget space-y-3.5 p-4">
        <div>
          <label
            htmlFor="progress-exercise-select"
            className="mb-1.5 block text-xs font-bold uppercase tracking-wider"
            style={{ color: 'var(--text-muted)' }}
          >
            Track Exercise Progress
          </label>
          <select
            id="progress-exercise-select"
            aria-label="Progress exercise"
            value={selectedExercise.id}
            onChange={(e) => setSelectedExerciseId(e.target.value)}
            className="bb-input w-full px-3.5 py-2.5 text-sm font-bold"
          >
            {snapshot.exercises.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.name}
              </option>
            ))}
          </select>
        </div>

        {selectedExercise.category === 'pullup' && (
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Pull-up progress mode">
            {(
              [
                { id: 'assisted', label: 'Assisted' },
                { id: 'bodyweight', label: 'Bodyweight' },
                { id: 'weighted', label: '+ Kilograms' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                aria-pressed={pullupMode === opt.id}
                onClick={() => setPullupMode(opt.id)}
                className={`rounded-xl py-2 text-xs font-bold transition ${
                  pullupMode === opt.id ? 'bb-pill-active' : 'bb-pill-idle'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {showWeightedMetricToggle && (
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Progress metric">
            <button
              type="button"
              aria-pressed={weightedMetric === 'topWeight'}
              onClick={() => setWeightedMetric('topWeight')}
              className={`rounded-xl py-2 text-xs font-bold transition ${
                weightedMetric === 'topWeight' ? 'bb-pill-active' : 'bb-pill-idle'
              }`}
            >
              Top Weight ({progression.yAxisUnit})
            </button>
            <button
              type="button"
              aria-pressed={weightedMetric === 'e1rm'}
              onClick={() => setWeightedMetric('e1rm')}
              className={`rounded-xl py-2 text-xs font-bold transition ${
                weightedMetric === 'e1rm' ? 'bb-pill-active' : 'bb-pill-idle'
              }`}
            >
              Est. 1RM ({progression.yAxisUnit})
            </button>
          </div>
        )}

        {/* Lifter Toggles */}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Compare lifters">
          {snapshot.lifters.map((lifter) => {
            const active = visibleLifterIds.includes(lifter.id);
            return (
              <button
                key={lifter.id}
                type="button"
                aria-pressed={active}
                onClick={() => toggleLifterVisibility(lifter.id)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition ${
                  active ? 'bb-pill-active' : 'bb-pill-idle opacity-60'
                }`}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: lifter.avatarColor }}
                />
                {lifter.name}
              </button>
            );
          })}
        </div>
      </section>

      {/* SVG Progression Chart */}
      <section className="bb-widget p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" style={{ color: 'var(--accent-text)' }} />
            <h3 className="text-sm font-extrabold">Progression Over Sessions</h3>
          </div>
          <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
            {progression.yAxisUnit}
          </span>
        </div>

        {!hasChartData ? (
          <div className="bb-subcard flex flex-col items-center py-9 text-center">
            <TrendingUp className="mb-2 h-6 w-6" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm font-semibold">No sets recorded yet for {selectedExercise.name}</p>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              Log sets in the Session tab to plot progression curves across dates.
            </p>
          </div>
        ) : (
          <div>
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="w-full overflow-visible"
              role="img"
              aria-label={`${selectedExercise.name} progression chart`}
            >
              {[0, 0.5, 1].map((t) => {
                const val = Math.round((yMin + (yMax - yMin) * t) * 10) / 10;
                const y = yForValue(val);
                return (
                  <g key={t}>
                    <line
                      x1={padLeft}
                      x2={chartWidth - padRight}
                      y1={y}
                      y2={y}
                      stroke="var(--border-subtle)"
                      strokeDasharray="3 3"
                    />
                    <text
                      x={padLeft - 6}
                      y={y + 3.5}
                      textAnchor="end"
                      fontSize="9.5"
                      fill="var(--text-muted)"
                    >
                      {formatWeightNumber(val)}
                    </text>
                  </g>
                );
              })}

              {/* X-axis first & last date labels */}
              {allDates.length > 0 && (
                <>
                  <text
                    x={xForDate(allDates[0])}
                    y={chartHeight - 6}
                    textAnchor={allDates.length === 1 ? 'middle' : 'start'}
                    fontSize="9.5"
                    fill="var(--text-muted)"
                  >
                    {allDates[0].slice(5)}
                  </text>
                  {allDates.length > 1 && (
                    <text
                      x={xForDate(allDates[allDates.length - 1])}
                      y={chartHeight - 6}
                      textAnchor="end"
                      fontSize="9.5"
                      fill="var(--text-muted)"
                    >
                      {allDates[allDates.length - 1].slice(5)}
                    </text>
                  )}
                </>
              )}

              {/* Lifter Lines & Points */}
              {snapshot.lifters
                .filter((l) => visibleLifterIds.includes(l.id))
                .map((lifter) => {
                  const pts = progression.seriesByLifter[lifter.id] ?? [];
                  if (pts.length === 0) return null;

                  const polylinePoints = pts
                    .map((pt) => `${xForDate(pt.sessionDate)},${yForValue(pt.value)}`)
                    .join(' ');

                  return (
                    <g key={lifter.id}>
                      {pts.length > 1 && (
                        <polyline
                          fill="none"
                          stroke={lifter.avatarColor}
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          points={polylinePoints}
                        />
                      )}
                      {pts.map((pt) => (
                        <circle
                          key={`${lifter.id}-${pt.sessionDate}`}
                          cx={xForDate(pt.sessionDate)}
                          cy={yForValue(pt.value)}
                          r="4"
                          fill={lifter.avatarColor}
                          stroke="var(--bg-surface)"
                          strokeWidth="1.5"
                        >
                          <title>
                            {lifter.name} ({pt.sessionDate}): {pt.detailLabel}
                          </title>
                        </circle>
                      ))}
                    </g>
                  );
                })}
            </svg>
          </div>
        )}
      </section>

      {/* Personal Records Grid */}
      <section className="bb-widget p-4">
        <div className="mb-3 flex items-center gap-2">
          <Award className="h-4 w-4" style={{ color: 'var(--accent-text)' }} />
          <h3 className="text-sm font-extrabold">Crew Personal Records</h3>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {snapshot.lifters.map((lifter) => {
            const pr = progression.prsByLifter[lifter.id];
            return (
              <div key={lifter.id} className="bb-subcard p-3">
                <div className="flex items-center gap-2">
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-extrabold text-white"
                    style={{ backgroundColor: lifter.avatarColor }}
                  >
                    {lifter.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="text-sm font-bold">{lifter.name}</span>
                </div>

                {pr ? (
                  <div className="mt-2">
                    <div className="text-lg font-extrabold" style={{ color: 'var(--accent-text)' }}>
                      {formatWeightNumber(pr.bestValue)} {pr.unit}
                    </div>
                    <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      Best set: {pr.bestSetLabel}
                    </div>
                    <div className="mt-0.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {pr.sessionDate} · {pr.totalSets} total sets
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                    No sets logged yet
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
