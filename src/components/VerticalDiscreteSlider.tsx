import { useMemo, useRef, useState, type PointerEvent } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { SliderStop } from '../lib/sliderOptions';

export interface VerticalDiscreteSliderProps {
  id: string;
  label: string;
  badgeText?: string;
  stops: readonly SliderStop[];
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
  stepUpLabel: string;
  stepDownLabel: string;
  trackTestId?: string;
}

const THUMB_PAD_PX = 16;

function computeLandmarkIndices(stops: readonly SliderStop[]): number[] {
  const maxIndex = stops.length - 1;
  if (maxIndex <= 0) return [0];

  const hasPullupModes =
    stops[0]?.rawValue === 'Assisted' && stops[1]?.rawValue === 'Bodyweight';

  const isOneToThirtyReps =
    stops.length === 30 && stops[0]?.rawValue === 1 && stops[29]?.rawValue === 30;

  const rawCandidates = hasPullupModes
    ? [maxIndex, 7, 1, 0]
    : isOneToThirtyReps
      ? [29, 19, 9, 0]
      : [
          maxIndex,
          Math.round(maxIndex * 0.67),
          Math.round(maxIndex * 0.33),
          0,
        ];

  const seen = new Set<number>();
  const unique: number[] = [];
  for (const idx of rawCandidates) {
    const clamped = Math.max(0, Math.min(maxIndex, idx));
    if (!seen.has(clamped)) {
      seen.add(clamped);
      unique.push(clamped);
    }
  }
  return unique.sort((a, b) => b - a);
}

export function VerticalDiscreteSlider({
  id,
  label,
  badgeText,
  stops,
  selectedIndex,
  onSelectIndex,
  stepUpLabel,
  stepDownLabel,
  trackTestId,
}: VerticalDiscreteSliderProps) {
  const maxIndex = Math.max(0, stops.length - 1);
  const safeSelected = Number.isFinite(selectedIndex) ? selectedIndex : 0;
  const clampedIndex = Math.max(0, Math.min(maxIndex, safeSelected));
  const currentStop = stops[clampedIndex] ?? stops[0];

  const railRef = useRef<HTMLDivElement | null>(null);
  const activePointerId = useRef<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const ratio = maxIndex === 0 ? 1 : clampedIndex / maxIndex;

  const landmarkIndices = useMemo(() => computeLandmarkIndices(stops), [stops]);

  const updateFromClientY = (clientY: number) => {
    if (maxIndex <= 0 || !railRef.current || !Number.isFinite(clientY)) return;
    const rect = railRef.current.getBoundingClientRect();
    const height = rect.height > 0 ? rect.height : 208;
    const usableHeight = Math.max(1, height - THUMB_PAD_PX * 2);
    const yFromTop = clientY - (rect.top + THUMB_PAD_PX);
    const nextRatio = Math.max(0, Math.min(1, 1 - yFromTop / usableHeight));
    const nextIndex = Math.round(nextRatio * maxIndex);
    onSelectIndex(nextIndex);
  };

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (maxIndex <= 0) return;
    e.preventDefault();
    const pid = e.pointerId ?? 0;
    activePointerId.current = pid;
    setIsDragging(true);
    if (typeof e.currentTarget.setPointerCapture === 'function') {
      try {
        e.currentTarget.setPointerCapture(pid);
      } catch {
        // Ignore synthetic pointer events without active pointer id
      }
    }
    updateFromClientY(e.clientY);
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const pid = e.pointerId ?? 0;
    if (activePointerId.current !== pid) return;
    e.preventDefault();
    updateFromClientY(e.clientY);
  };

  const finishPointerDrag = (e: PointerEvent<HTMLDivElement>) => {
    const pid = e.pointerId ?? 0;
    if (activePointerId.current !== pid) return;
    activePointerId.current = null;
    setIsDragging(false);
  };

  const isTextStop =
    currentStop?.rawValue === 'Assisted' || currentStop?.rawValue === 'Bodyweight';

  return (
    <div className="bb-subcard flex flex-col items-center p-3 focus-within:ring-2 focus-within:ring-[var(--accent)]">
      {/* Header Label */}
      <div className="mb-2 flex w-full items-center justify-between gap-1">
        <label
          htmlFor={id}
          className="text-[11px] font-extrabold uppercase tracking-wider"
          style={{ color: 'var(--text-muted)' }}
        >
          {label}
        </label>
        {badgeText && (
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
            style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent-text)' }}
          >
            {badgeText}
          </span>
        )}
      </div>

      {/* Prominent Live Value Readout */}
      <div
        aria-live="polite"
        className="mb-2.5 flex h-[60px] w-full flex-col items-center justify-center rounded-xl px-2 py-1.5 text-center"
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1.5px solid var(--accent-border)',
        }}
      >
        <div
          className={`leading-tight font-extrabold tabular-nums ${
            isTextStop ? 'text-base' : 'text-2xl'
          }`}
          style={{ color: 'var(--accent-text)' }}
        >
          {currentStop?.primaryLabel}
        </div>
        <div
          className="mt-0.5 text-[10px] font-bold uppercase tracking-wide"
          style={{ color: 'var(--text-muted)' }}
        >
          {currentStop?.secondaryLabel}
        </div>
      </div>

      {/*Accessible Native Range Slider Input */}
      <input
        id={id}
        type="range"
        aria-label={label}
        aria-orientation="vertical"
        min={0}
        max={maxIndex}
        step={1}
        value={clampedIndex}
        aria-valuemin={0}
        aria-valuemax={maxIndex}
        aria-valuenow={clampedIndex}
        aria-valuetext={currentStop?.ariaValueText ?? ''}
        disabled={maxIndex === 0}
        onChange={(e) => {
          const idx = Math.max(0, Math.min(maxIndex, Number(e.target.value)));
          onSelectIndex(idx);
        }}
        className="sr-only"
      />

      {/* Top Single-Notch (+) Button */}
      <button
        type="button"
        aria-label={stepUpLabel}
        disabled={clampedIndex >= maxIndex}
        onClick={() => onSelectIndex(Math.min(maxIndex, clampedIndex + 1))}
        className="bb-pill-idle flex h-9 w-full items-center justify-center rounded-xl font-bold transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus className="h-4 w-4" />
      </button>

      {/* Vertical Touch Scrubbing Track (touch-action: none prevents page scroll) */}
      <div
        ref={railRef}
        data-testid={trackTestId}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointerDrag}
        onPointerCancel={finishPointerDrag}
        style={{ touchAction: 'none' }}
        className="bb-slider-track relative my-2 flex h-52 w-full cursor-ns-resize touch-none items-center justify-center select-none"
      >
        {/* Inner Rail + Scale Ticks Wrapper */}
        <div className="relative flex h-full w-full items-center justify-center">
          {/* Vertical Track Tube */}
          <div
            className="relative w-4 overflow-hidden rounded-full"
            style={{
              height: `calc(100% - ${THUMB_PAD_PX * 2}px)`,
              backgroundColor: 'var(--bg-input)',
              border: '1.5px solid var(--border-subtle)',
            }}
          >
            {/* Active Fill from Bottom to Thumb */}
            <div
              className={`absolute right-0 bottom-0 left-0 rounded-b-full ${
                isDragging ? '' : 'transition-[height] duration-75'
              }`}
              style={{
                height: `${ratio * 100}%`,
                backgroundColor: 'var(--accent)',
                opacity: 0.85,
              }}
            />
          </div>

          {/* Draggable Thumb Handle */}
          <div
            className={`pointer-events-none absolute left-1/2 flex h-8 w-12 -translate-x-1/2 flex-col items-center justify-center gap-1 rounded-xl ${
              isDragging ? 'scale-105' : 'transition-[bottom,transform] duration-75'
            }`}
            style={{
              bottom: `calc(${THUMB_PAD_PX}px + (100% - ${THUMB_PAD_PX * 2}px) * ${ratio} - 16px)`,
              backgroundColor: 'var(--bg-surface)',
              border: '2px solid var(--accent)',
              boxShadow: 'var(--accent-glow)',
            }}
          >
            <span
              className="h-0.5 w-5 rounded-full"
              style={{ backgroundColor: 'var(--accent)' }}
            />
            <span
              className="h-0.5 w-5 rounded-full"
              style={{ backgroundColor: 'var(--accent)' }}
            />
          </div>

          {/* Right-Side Landmark Scale Labels */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-1.5"
            style={{
              top: `${THUMB_PAD_PX}px`,
              bottom: `${THUMB_PAD_PX}px`,
              width: '2.5rem',
            }}
          >
            {landmarkIndices.map((idx) => {
              const tickRatio = maxIndex === 0 ? 1 : idx / maxIndex;
              const isSelected = idx === clampedIndex;
              return (
                <span
                  key={stops[idx]?.key ?? idx}
                  className="absolute right-0 translate-y-1/2 text-[10px] font-bold tabular-nums"
                  style={{
                    bottom: `${tickRatio * 100}%`,
                    color: isSelected ? 'var(--accent-text)' : 'var(--text-muted)',
                    opacity: isSelected ? 1 : 0.72,
                  }}
                >
                  {stops[idx]?.tickLabel}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Single-Notch (−) Button */}
      <button
        type="button"
        aria-label={stepDownLabel}
        disabled={clampedIndex <= 0}
        onClick={() => onSelectIndex(Math.max(0, clampedIndex - 1))}
        className="bb-pill-idle flex h-9 w-full items-center justify-center rounded-xl font-bold transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Minus className="h-4 w-4" />
      </button>
    </div>
  );
}
