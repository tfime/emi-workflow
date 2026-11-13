/**
 * Đo latency SPFx — bật: localStorage.setItem('emiPayPerf','1') rồi F5.
 * Tắt: localStorage.removeItem('emiPayPerf')
 * Xem: Console filter "EMI PAY perf"
 */
export function perfEnabled(): boolean {
  try {
    return localStorage.getItem('emiPayPerf') === '1';
  } catch {
    return false;
  }
}

export function perfNow(): number {
  return typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now();
}

/** Log một mốc (ms từ t0). */
export function perfLog(label: string, t0: number, extra?: Record<string, unknown>): void {
  if (!perfEnabled()) return;
  const ms = Math.round(perfNow() - t0);
  const row = { ms, ...extra };
  // eslint-disable-next-line no-console
  console.info(`[EMI PAY perf] ${label}`, row);
}

/** Bọc async: log tổng thời gian. */
export async function perfTimed<T>(
  label: string,
  fn: () => Promise<T>,
  extra?: Record<string, unknown>
): Promise<T> {
  const t0 = perfNow();
  try {
    const out = await fn();
    perfLog(label, t0, { ...extra, ok: true });
    return out;
  } catch (e) {
    perfLog(label, t0, {
      ...extra,
      ok: false,
      error: e instanceof Error ? e.message : String(e)
    });
    throw e;
  }
}
