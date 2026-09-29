export interface SavingsStats {
  original: number;
  optimized: number;
}

export interface SavingsRow {
  Original: string;
  Optimized: string;
  Saved: string;
  '%': string;
}

/** Returns the width closest to `target`; ties go to the smaller width. */
export const pickClosestWidth = (widths: number[], target: number): number => {
  const sorted = [...widths].sort((a, b) => a - b);
  return sorted.reduce((prev, curr) =>
    Math.abs(curr - target) < Math.abs(prev - target) ? curr : prev
  );
};

const toMB = (bytes: number) => (bytes / 1024 / 1024).toFixed(2) + ' MB';

/** Formats per-breakpoint byte totals into the savings report table. */
export const summarizeSavings = (
  stats: Record<string, SavingsStats>
): Record<string, SavingsRow> => {
  return Object.entries(stats).reduce((acc, [name, { original, optimized }]) => {
    const savedBytes = original - optimized;
    acc[name] = {
      Original: toMB(original),
      Optimized: toMB(optimized),
      Saved: toMB(savedBytes),
      '%': original > 0 ? ((savedBytes / original) * 100).toFixed(1) + '%' : '0%',
    };
    return acc;
  }, {} as Record<string, SavingsRow>);
};
