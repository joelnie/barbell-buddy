import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { SliderStop } from '../lib/sliderOptions';

export interface VerticalDiscreteSliderProps {
  id: string;
  label: string;
  stops: readonly SliderStop[];
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
  stepUpLabel: string;
  stepDownLabel: string;
  trackTestId?: string;
}

const ROW_HEIGHT_PX = 40;
const VISIBLE_SLOTS = 5;
const WHEEL_HEIGHT_PX = ROW_HEIGHT_PX * VISIBLE_SLOTS; // 200px (offsets +2, +1, 0, -1, -2)

function computeSlotOpacity(absOffset: number): number {
  if (absOffset >= 2.5) return 0;
  if (absOffset <= 1) {
    // 0 -> 1.0 (selected middle), 1 -> 0.5 (next/prev shadier)
    return Math.round((1 - 0.5 * absOffset) * 1000) / 1000;
  }
  if (absOffset <= 2) {
    // 1 -> 0.5, 2 -> 0.18 (second next/prev barely visible)
    return Math.round((0.5 - 0.32 * (absOffset - 1)) * 1000) / 1000;
  }
  // 2 -> 0.18, 2.5 -> 0 (third ones not visible)
  return Math.round(0.18 * (1 - (absOffset - 2) / 0.5) * 1000) / 1000;
}

function computeSlotScale(absOffset: number): number {
  if (absOffset <= 1) {
    return 1 - 0.1 * absOffset;
  }
  if (absOffset <= 2) {
    return 0.9 - 0.1 * (absOffset - 1);
  }
  return 0.8;
}

export function VerticalDiscreteSlider({
  id,
  label,
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

  const wheelRef = useRef<HTMLDivElement | null>(null);
  const clampedIndexRef = useRef<number>(clampedIndex);
  clampedIndexRef.current = clampedIndex;
  const maxIndexRef = useRef<number>(maxIndex);
  maxIndexRef.current = maxIndex;
  const onSelectRef = useRef(onSelectIndex);
  onSelectRef.current = onSelectIndex;

  // Drag & flick tracking
  const activePointerId = useRef<number | null>(null);
  const dragStartY = useRef<number>(0);
  const dragStartIndex = useRef<number>(0);
  const maxMovementPx = useRef<number>(0);
  const velocitySamples = useRef<{ y: number; t: number }[]>([]);
  const wheelDeltaAccum = useRef<number>(0);

  const [dragVirtualIndex, setDragVirtualIndex] = useState<number | null>(null);
  const isDragging = dragVirtualIndex !== null;
  const virtualIndex = dragVirtualIndex ?? clampedIndex;

  // Native non-passive wheel listener so mouse/trackpad scrolling spins the drum cleanly
  useEffect(() => {
    const el = wheelRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (maxIndexRef.current <= 0) return;
      e.preventDefault();
      wheelDeltaAccum.current += e.deltaY;
      const stepThreshold = 28;
      if (Math.abs(wheelDeltaAccum.current) >= stepThreshold) {
        const steps = Math.trunc(wheelDeltaAccum.current / stepThreshold);
        wheelDeltaAccum.current -= steps * stepThreshold;
        // Scrolling wheel up (deltaY < 0) increases value toward +; scrolling down decreases toward -
        const nextIdx = Math.max(
          0,
          Math.min(maxIndexRef.current, clampedIndexRef.current - steps),
        );
        if (nextIdx !== clampedIndexRef.current) {
          onSelectRef.current(nextIdx);
        }
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, []);

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (maxIndex <= 0 || !Number.isFinite(e.clientY)) return;
    e.preventDefault();
    const pid = e.pointerId ?? 0;
    activePointerId.current = pid;
    dragStartY.current = e.clientY;
    dragStartIndex.current = clampedIndex;
    maxMovementPx.current = 0;
    velocitySamples.current = [{ y: e.clientY, t: performance.now() }];
    setDragVirtualIndex(clampedIndex);

    if (typeof e.currentTarget.setPointerCapture === 'function') {
      try {
        e.currentTarget.setPointerCapture(pid);
      } catch {
        // Ignore synthetic pointer events without active browser pointer capture
      }
    }
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const pid = e.pointerId ?? 0;
    if (activePointerId.current !== pid || !Number.isFinite(e.clientY)) return;
    e.preventDefault();

    const deltaY = e.clientY - dragStartY.current;
    maxMovementPx.current = Math.max(maxMovementPx.current, Math.abs(deltaY));

    const now = performance.now();
    velocitySamples.current.push({ y: e.clientY, t: now });
    while (velocitySamples.current.length > 6 && now - velocitySamples.current[0].t > 100) {
      velocitySamples.current.shift();
    }

    // Dragging downward (deltaY > 0) pulls upper (+1, +2) values down into the middle highlight;
    // dragging upward (deltaY < 0) pushes lower (-1, -2) values up into the middle highlight.
    const nextVirtual = Math.max(
      0,
      Math.min(maxIndex, dragStartIndex.current + deltaY / ROW_HEIGHT_PX),
    );
    setDragVirtualIndex(nextVirtual);

    const snapped = Math.round(nextVirtual);
    if (snapped !== clampedIndex) {
      onSelectIndex(snapped);
    }
  };

  const finishPointerInteraction = (e: PointerEvent<HTMLDivElement>) => {
    const pid = e.pointerId ?? 0;
    if (activePointerId.current !== pid) return;
    activePointerId.current = null;

    if (maxMovementPx.current < 5 && wheelRef.current && Number.isFinite(e.clientY)) {
      // Tap on a visible neighbor slot (+2, +1, -1, -2) selects it directly
      const rect = wheelRef.current.getBoundingClientRect();
      const centerY = rect.top + (rect.height > 0 ? rect.height / 2 : WHEEL_HEIGHT_PX / 2);
      const tappedSlotOffset = Math.round((centerY - e.clientY) / ROW_HEIGHT_PX);
      if (tappedSlotOffset !== 0 && Math.abs(tappedSlotOffset) <= 2) {
        const target = Math.max(0, Math.min(maxIndex, dragStartIndex.current + tappedSlotOffset));
        onSelectIndex(target);
      }
      setDragVirtualIndex(null);
      return;
    }

    // Compute flick velocity for smooth momentum scrolling across longer ranges
    const samples = velocitySamples.current;
    let targetIndex = Math.round(dragVirtualIndex ?? clampedIndex);
    if (samples.length >= 2) {
      const first = samples[0];
      const last = samples[samples.length - 1];
      const dtMs = last.t - first.t;
      if (dtMs > 8 && dtMs < 250) {
        const velocityItemsPerSec = ((last.y - first.y) / ROW_HEIGHT_PX) * (1000 / dtMs);
        if (Math.abs(velocityItemsPerSec) > 3.5) {
          targetIndex = Math.max(
            0,
            Math.min(maxIndex, Math.round((dragVirtualIndex ?? clampedIndex) + velocityItemsPerSec * 0.2)),
          );
        }
      }
    }

    onSelectIndex(targetIndex);
    setDragVirtualIndex(null);
  };

  // Render only slots strictly within +/-2 of the current wheel position (3rd+ are never visible)
  const minVisibleIdx = Math.max(0, Math.ceil(virtualIndex - 2.49));
  const maxVisibleIdx = Math.min(maxIndex, Math.floor(virtualIndex + 2.49));
  const visibleIndices: number[] = [];
  for (let i = maxVisibleIdx; i >= minVisibleIdx; i--) {
    visibleIndices.push(i);
  }

  return (
    <div className="bb-subcard flex flex-col items-center p-3 focus-within:ring-2 focus-within:ring-[var(--accent)]">
      {/* Clean Header Label (info range badges dropped) */}
      <div className="mb-2 flex w-full items-center justify-center">
        <label
          htmlFor={id}
          className="text-[11px] font-extrabold uppercase tracking-wider"
          style={{ color: 'var(--text-muted)' }}
        >
          {label}
        </label>
      </div>

      {/* Accessible Native Range Slider Input */}
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

      {/* 5-Slot Scrollable Drum / Wheel (Selected always in middle & highlighted; ±1 shadier; ±2 barely visible; ±3+ hidden) */}
      <div
        ref={wheelRef}
        data-testid={trackTestId}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointerInteraction}
        onPointerCancel={() => {
          activePointerId.current = null;
          setDragVirtualIndex(null);
        }}
        style={{ height: `${WHEEL_HEIGHT_PX}px`, touchAction: 'none' }}
        className="bb-slider-track relative my-2 w-full cursor-ns-resize touch-none overflow-hidden select-none"
      >
        {/* Fixed Middle Selection Highlight Frame */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-1 left-1 top-1/2 -translate-y-1/2 rounded-xl"
          style={{
            height: `${ROW_HEIGHT_PX + 2}px`,
            backgroundColor: 'var(--accent-soft)',
            border: '2px solid var(--accent)',
            boxShadow: 'var(--accent-glow)',
          }}
        />

        {/* Wheel Value Slots */}
        {visibleIndices.map((idx) => {
          const stop = stops[idx];
          if (!stop) return null;

          const offset = idx - virtualIndex;
          const absOffset = Math.abs(offset);
          if (absOffset >= 2.5) return null;

          const opacity = computeSlotOpacity(absOffset);
          const scale = computeSlotScale(absOffset);
          const yOffsetPx = -offset * ROW_HEIGHT_PX;
          const discreteOffset = idx - clampedIndex;
          const isCenterSelected = Math.round(virtualIndex) === idx;
          const isTextStop =
            stop.rawValue === 'Assisted' || stop.rawValue === 'Bodyweight';

          return (
            <div
              key={stop.key}
              data-wheel-offset={discreteOffset}
              aria-hidden={!isCenterSelected}
              style={{
                height: `${ROW_HEIGHT_PX}px`,
                top: '50%',
                transform: `translateY(calc(-50% + ${yOffsetPx}px)) scale(${scale})`,
                opacity,
                color: isCenterSelected ? 'var(--accent-text)' : 'var(--text-primary)',
              }}
              className={`pointer-events-none absolute right-2 left-2 flex items-center justify-center text-center tabular-nums ${
                isDragging ? '' : 'transition-[transform,opacity,color] duration-150 ease-out'
              } ${
                isCenterSelected
                  ? isTextStop
                    ? 'text-sm font-extrabold'
                    : 'text-lg font-extrabold'
                  : isTextStop
                    ? 'text-xs font-bold'
                    : 'text-sm font-bold'
              }`}
            >
              <span className="truncate">{stop.primaryLabel}</span>
            </div>
          );
        })}
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
