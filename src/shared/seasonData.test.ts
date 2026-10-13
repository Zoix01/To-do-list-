import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { addDays } from './dates';
import { GAMIFICATION_START } from './economy';
import { SEASONS } from './seasonData';
import { currentSeason, piecesOf } from './seasons';

describe('season files (13.13)', () => {
  it('the first year is prepared: winter, spring, summer, autumn', () => {
    expect(SEASONS.map((season) => season.theme)).toEqual(['winter', 'spring', 'summer', 'autumn']);
  });

  it('Season 1 starts with the rewards and runs until the end of February', () => {
    expect(SEASONS[0]).toMatchObject({ start: GAMIFICATION_START, end: '2027-02-28' });
    expect(currentSeason(SEASONS, GAMIFICATION_START)?.id).toBe(SEASONS[0]!.id);
  });

  it('seasons follow each other without gaps (meteorological seasons)', () => {
    for (let i = 1; i < SEASONS.length; i++) {
      expect(SEASONS[i]!.start).toBe(addDays(SEASONS[i - 1]!.end, 1));
    }
    expect(SEASONS.map((s) => s.start.slice(5))).toEqual(['10-15', '03-01', '06-01', '09-01']);
  });

  it.each(SEASONS.map((season) => [season.name, season] as const))(
    '%s: 4 artworks × 6 pieces, one legendary and one rare each, images present',
    (_name, season) => {
      expect(season.artworks).toHaveLength(4);
      for (const artwork of season.artworks) {
        expect(artwork.cols * artwork.rows).toBe(6);
        expect(artwork.width >= artwork.height ? [3, 2] : [2, 3]).toEqual([
          artwork.cols,
          artwork.rows,
        ]);
        expect(artwork.legendary).not.toBe(artwork.rare);
        expect(Math.max(artwork.legendary, artwork.rare)).toBeLessThan(6);
        expect(Math.max(artwork.width, artwork.height)).toBeLessThanOrEqual(2000);
        expect(['Public domain', 'CC0']).toContain(artwork.license);
        expect(existsSync(`public${artwork.image}`)).toBe(true);
      }
      const ids = piecesOf(season).map((p) => p.id);
      expect(new Set(ids).size).toBe(24);
    },
  );

  it('piece ids are unique across seasons', () => {
    const ids = SEASONS.flatMap((season) => piecesOf(season).map((p) => p.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('seasonsFrom', () => {
  it('moves Season 1 earlier with an earlier rewards start, never later', async () => {
    const { seasonsFrom } = await import('./seasonData');
    expect(seasonsFrom('2026-10-05')[0]!.start).toBe('2026-10-05');
    expect(seasonsFrom('2026-11-01')[0]!.start).toBe('2026-10-15');
    expect(seasonsFrom('2026-10-05')[1]!.start).toBe('2027-03-01');
  });
});
