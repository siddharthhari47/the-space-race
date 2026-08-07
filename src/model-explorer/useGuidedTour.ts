import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HotspotConfig } from "./types";

interface TourStop {
  hotspot: HotspotConfig;
  hotspotIndex: number;
}

interface UseGuidedTourArgs {
  hotspots: HotspotConfig[];
  dwellMs: number;
  // Applies a hotspot's selection (highlight + fly-to via CameraRig
  // watching selectedHotspot) without any tour-specific side effects —
  // kept separate from a marker click's own handler so the tour's
  // internal auto-advance doesn't loop back and pause itself.
  applySelection: (hotspot: HotspotConfig, index: number) => void;
}

// Same fixed duration useCameraFlyTo tweens over — the auto-advance timer
// waits for the fly-to to finish before starting the dwell countdown, so
// a stop is never cut short mid-flight.
const FLY_DURATION_MS = 1400;

// A small state machine sequencing through hotspots in tourOrder, reusing
// the exact same selection path (applySelection) a manual marker click
// takes — there's no parallel "tour rendering," just this hook driving
// the same state a click would.
export function useGuidedTour({ hotspots, dwellMs, applySelection }: UseGuidedTourArgs) {
  const stops = useMemo<TourStop[]>(
    () =>
      hotspots
        .map((hotspot, hotspotIndex) => ({ hotspot, hotspotIndex }))
        .filter((s) => s.hotspot.tourOrder !== undefined)
        .sort((a, b) => (a.hotspot.tourOrder as number) - (b.hotspot.tourOrder as number)),
    [hotspots]
  );

  const [isPlaying, setIsPlaying] = useState(false);
  const [stopIndex, setStopIndex] = useState(0);
  const timerRef = useRef<number | undefined>(undefined);

  const clearTimer = useCallback(() => {
    window.clearTimeout(timerRef.current);
  }, []);

  const goTo = useCallback(
    (nextStopIndex: number) => {
      const stop = stops[nextStopIndex];
      if (!stop) return;
      setStopIndex(nextStopIndex);
      applySelection(stop.hotspot, stop.hotspotIndex);
    },
    [stops, applySelection]
  );

  const play = useCallback(() => {
    if (stops.length === 0) return;
    setIsPlaying(true);
    goTo(stopIndex);
  }, [stops.length, goTo, stopIndex]);

  const pause = useCallback(() => {
    setIsPlaying(false);
    clearTimer();
  }, [clearTimer]);

  const next = useCallback(() => {
    clearTimer();
    goTo((stopIndex + 1) % stops.length);
  }, [clearTimer, goTo, stopIndex, stops.length]);

  const prev = useCallback(() => {
    clearTimer();
    goTo((stopIndex - 1 + stops.length) % stops.length);
  }, [clearTimer, goTo, stopIndex, stops.length]);

  const exit = useCallback(() => {
    clearTimer();
    setIsPlaying(false);
  }, [clearTimer]);

  useEffect(() => {
    if (!isPlaying || stops.length === 0) return undefined;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const flightTime = reduceMotion ? 0 : FLY_DURATION_MS;

    clearTimer();
    timerRef.current = window.setTimeout(() => {
      setStopIndex((current) => {
        const nextIndex = (current + 1) % stops.length;
        const stop = stops[nextIndex];
        if (stop) applySelection(stop.hotspot, stop.hotspotIndex);
        return nextIndex;
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, flightTime + dwellMs);

    return clearTimer;
  }, [isPlaying, stopIndex, stops, dwellMs, clearTimer, applySelection]);

  return {
    isPlaying,
    hasStops: stops.length > 0,
    currentStopNumber: stopIndex + 1,
    totalStops: stops.length,
    play,
    pause,
    next,
    prev,
    exit,
  };
}
