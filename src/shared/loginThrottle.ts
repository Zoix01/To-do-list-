/** Brute-force protection for login (SPEC §3): 5 wrong attempts → wait 1 minute. */

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MS = 60_000;

export interface AttemptState {
  failedCount: number;
  /** Epoch ms; null when not locked. */
  lockedUntil: number | null;
}

/** Milliseconds until another attempt is allowed (0 = allowed now). */
export function lockRemaining(state: AttemptState | null, now: number): number {
  if (!state?.lockedUntil) return 0;
  return Math.max(0, state.lockedUntil - now);
}

/** State after one more wrong password. The 5th failure starts a lockout and resets the count. */
export function afterFailedAttempt(state: AttemptState | null, now: number): AttemptState {
  const failedCount = (state?.failedCount ?? 0) + 1;
  if (failedCount >= MAX_FAILED_ATTEMPTS) return { failedCount: 0, lockedUntil: now + LOCKOUT_MS };
  return { failedCount, lockedUntil: null };
}
