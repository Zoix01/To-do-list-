/// <reference types="vite/client" />
import type { Season } from './seasons';

/** Every season file in seasons/, oldest first (SPEC §13.13). */
const files = import.meta.glob<Season>('../../seasons/*.json', { eager: true, import: 'default' });

export const SEASONS: readonly Season[] = Object.values(files).sort((a, b) =>
  a.start.localeCompare(b.start),
);

/**
 * Season 1 starts with the rewards (GAMIFICATION_START). When the start is
 * moved earlier for testing (REWARDS_START), Season 1 moves with it.
 */
export function seasonsFrom(rewardsStart: string): readonly Season[] {
  const [first, ...rest] = SEASONS;
  if (!first || rewardsStart >= first.start) return SEASONS;
  return [{ ...first, start: rewardsStart }, ...rest];
}
