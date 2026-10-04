export type AdaptiveTimingMode = 'PRODUCTION' | 'DEMO';

export const DEMO_TIMING_LABEL =
    'DEMO — ACCELERATED ADAPTIVE TIMING';

export const PRODUCTION_TIMING_LABEL =
    'PRODUCTION — NORMAL ADAPTIVE TIMING';

export function formatAdaptiveTimingMode(
    mode: AdaptiveTimingMode
): string {
    return mode === 'DEMO'
        ? DEMO_TIMING_LABEL
        : PRODUCTION_TIMING_LABEL;
}

export function formatDuration(milliseconds: number): string {
    const totalSeconds = Math.max(0, milliseconds / 1000);

    if (totalSeconds < 60) {
        return `${totalSeconds.toFixed(1)} s`;
    }

    const wholeSeconds = Math.floor(totalSeconds);
    const hours = Math.floor(wholeSeconds / 3600);
    const minutes = Math.floor((wholeSeconds % 3600) / 60);
    const seconds = wholeSeconds % 60;

    if (hours > 0) {
        return `${hours}h ${minutes}m ${seconds}s`;
    }

    return `${minutes}m ${seconds}s`;
}

export function formatPercent(value: number): string {
    return `${value.toFixed(1)}%`;
}
