import { describe, expect, it } from 'vitest';
import { afterFailedAttempt, lockRemaining, LOCKOUT_MS, type AttemptState } from './loginThrottle';

describe('login throttle', () => {
  it('allows attempts with no history', () => {
    expect(lockRemaining(null, 1000)).toBe(0);
  });

  it('locks for one minute after the 5th wrong attempt', () => {
    let state: AttemptState | null = null;
    for (let i = 0; i < 4; i++) {
      state = afterFailedAttempt(state, 1000);
      expect(lockRemaining(state, 1000)).toBe(0);
    }
    state = afterFailedAttempt(state, 1000);
    expect(lockRemaining(state, 1000)).toBe(LOCKOUT_MS);
    expect(lockRemaining(state, 1000 + 30_000)).toBe(30_000);
    expect(lockRemaining(state, 1000 + LOCKOUT_MS)).toBe(0);
  });

  it('starts counting again after a lockout', () => {
    let state: AttemptState | null = null;
    for (let i = 0; i < 5; i++) state = afterFailedAttempt(state, 0);
    state = afterFailedAttempt(state, LOCKOUT_MS + 1);
    expect(state).toEqual({ failedCount: 1, lockedUntil: null });
  });
});
