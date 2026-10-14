import { describe, expect, it } from 'vitest';
import {
  canUseCharm,
  openBox,
  pouchCoins,
  rollPiece,
  secureRng,
  seededRng,
  type BoxContext,
} from './boxes';
import { BOX_ODDS, TIER_ODDS } from './economy';
import {
  currentSeason,
  daysLeft,
  piecePrice,
  piecesOf,
  startedSeasons,
  type Season,
} from './seasons';

const artwork = (id: string, legendary: number, rare: number) => ({
  id,
  title: id,
  artist: 'x',
  year: '1900',
  image: `/art/${id}.webp`,
  width: 3000,
  height: 2000,
  cols: 3,
  rows: 2,
  legendary,
  rare,
  source: 'x',
  license: 'Public domain',
});
const season = (id: string, start: string, end: string): Season => ({
  id,
  name: id,
  theme: 'winter',
  start,
  end,
  artworks: [
    artwork(`${id}-a`, 4, 1),
    artwork(`${id}-b`, 0, 5),
    artwork(`${id}-c`, 2, 3),
    artwork(`${id}-d`, 5, 0),
  ],
});
const S1 = season('s1', '2026-10-19', '2027-02-28');
const S2 = season('s2', '2027-03-01', '2027-05-31');
const PIECES = piecesOf(S1);

const context = (extra: Partial<BoxContext> = {}): BoxContext => ({
  pieces: PIECES,
  owned: new Set(),
  rewards: [{ id: 'coffee', price: 1000 }],
  unownedCosmetics: ['sky', 'leaf'],
  charm: false,
  boxPrice: 600,
  ...extra,
});

describe('seasons (13.13)', () => {
  it('4 artworks × 6 pieces: 16 common, 4 rare, 4 legendary', () => {
    expect(PIECES).toHaveLength(24);
    const count = (tier: string) => PIECES.filter((p) => p.tier === tier).length;
    expect([count('common'), count('rare'), count('legendary')]).toEqual([16, 4, 4]);
  });
  it('current season: the latest that has started; stays after it ends', () => {
    expect(currentSeason([S1, S2], '2026-10-18')).toBeNull();
    expect(currentSeason([S1, S2], '2026-10-19')?.id).toBe('s1');
    expect(currentSeason([S1, S2], '2027-02-28')?.id).toBe('s1');
    expect(currentSeason([S1, S2], '2027-03-01')?.id).toBe('s2');
    expect(currentSeason([S1], '2027-04-01')?.id).toBe('s1');
    expect(startedSeasons([S1, S2], '2027-01-01').map((s) => s.id)).toEqual(['s1']);
  });
  it('days left', () => {
    expect(daysLeft(S1, '2027-02-28')).toBe(1);
    expect(daysLeft(S1, '2027-03-02')).toBe(0);
  });
  it('shard prices: 40 / 60 / 80, past seasons 1.5×', () => {
    const tierPiece = (tier: string) => PIECES.find((p) => p.tier === tier)!;
    expect(['common', 'rare', 'legendary'].map((t) => piecePrice(tierPiece(t), S1))).toEqual([
      40, 60, 80,
    ]);
    expect(['common', 'rare', 'legendary'].map((t) => piecePrice(tierPiece(t), S2))).toEqual([
      60, 90, 120,
    ]);
  });
});

describe('mystery boxes: 100,000 openings (13.7)', () => {
  const rng = seededRng(2026);
  const counts: Record<string, number> = {};
  const tiers: Record<string, number> = {};
  const N = 100_000;
  for (let i = 0; i < N; i++) {
    const result = openBox(rng, context());
    counts[result.type] = (counts[result.type] ?? 0) + 1;
    if (result.type === 'piece') tiers[result.tier] = (tiers[result.tier] ?? 0) + 1;
  }

  it.each(Object.entries(BOX_ODDS))('%s within ±0.5% of its odds', (type, odds) => {
    expect(Math.abs((counts[type] ?? 0) / N - odds)).toBeLessThan(0.005);
  });

  it.each(Object.entries(TIER_ODDS))('%s pieces within ±0.5%', (tier, odds) => {
    expect(Math.abs((tiers[tier] ?? 0) / counts.piece! - odds)).toBeLessThan(0.005);
  });

  it('the server’s secure generator gives the same piece rarities (±1%)', () => {
    const rarities: Record<string, number> = {};
    let pieces = 0;
    for (let i = 0; i < N; i++) {
      const result = openBox(secureRng, context());
      if (result.type !== 'piece') continue;
      pieces++;
      rarities[result.tier] = (rarities[result.tier] ?? 0) + 1;
    }
    for (const [tier, odds] of Object.entries(TIER_ODDS)) {
      expect(Math.abs((rarities[tier] ?? 0) / pieces - odds)).toBeLessThan(0.01);
    }
  });

  it('coin pouch: mean 1.5× the box price (±3%), between 0.1× and 5×', () => {
    const r = seededRng(7);
    let sum = 0;
    let min = Infinity;
    let max = 0;
    for (let i = 0; i < N; i++) {
      const coins = pouchCoins(r, 600);
      sum += coins;
      min = Math.min(min, coins);
      max = Math.max(max, coins);
    }
    expect(Math.abs(sum / N / 600 - 1.5)).toBeLessThan(0.045);
    expect(min).toBeGreaterThanOrEqual(60);
    expect(max).toBeLessThanOrEqual(3000);
  });
});

describe('box fallbacks and choices', () => {
  const resultsOf = (ctx: BoxContext, n = 20_000) => {
    const rng = seededRng(11);
    return Array.from({ length: n }, () => openBox(rng, ctx));
  };

  it('no rewards defined → reward results become coin pouches', () => {
    const results = resultsOf(context({ rewards: [] }));
    expect(results.some((r) => r.type === 'reward')).toBe(false);
    const pouches = results.filter((r) => r.type === 'pouch').length / results.length;
    expect(pouches).toBeCloseTo(BOX_ODDS.pouch + BOX_ODDS.reward, 1);
  });

  it('all cosmetics owned → cosmetic results become coin pouches', () => {
    const results = resultsOf(context({ unownedCosmetics: [] }));
    expect(results.some((r) => r.type === 'cosmetic')).toBe(false);
  });

  it('cosmetics: only ones not owned yet', () => {
    const results = resultsOf(context({ unownedCosmetics: ['leaf'] }));
    const ids = new Set(results.flatMap((r) => (r.type === 'cosmetic' ? [r.cosmeticId] : [])));
    expect([...ids]).toEqual(['leaf']);
  });

  it('real-life rewards are weighted by 1 / price', () => {
    const results = resultsOf(
      context({
        rewards: [
          { id: 'cheap', price: 500 },
          { id: 'dear', price: 1500 },
        ],
      }),
      200_000,
    );
    const picks = results.flatMap((r) => (r.type === 'reward' ? [r.rewardId] : []));
    const cheap = picks.filter((id) => id === 'cheap').length / picks.length;
    expect(cheap).toBeCloseTo(0.75, 1); // (1/500) / (1/500 + 1/1500)
  });

  it('duplicates turn into shards: 10 / 20 / 50', () => {
    const owned = new Set(PIECES.map((p) => p.id));
    const rng = seededRng(3);
    const seen: Record<string, number> = {};
    for (let i = 0; i < 2000; i++) {
      const r = rollPiece(rng, PIECES, owned);
      if (r.type === 'piece') {
        expect(r.duplicate).toBe(true);
        seen[r.tier] = r.shards;
      }
    }
    expect(seen).toEqual({ common: 10, rare: 20, legendary: 50 });
  });

  it('lucky charm: always a piece not owned yet, tiers restricted to what is left', () => {
    const owned = new Set(PIECES.filter((p) => p.tier !== 'legendary').map((p) => p.id));
    const results = resultsOf(context({ owned, charm: true }), 500);
    expect(results.every((r) => r.type === 'piece' && !r.duplicate && r.tier === 'legendary')).toBe(
      true,
    );
  });

  it('lucky charm can’t be used when the season is complete', () => {
    expect(canUseCharm(PIECES, new Set(PIECES.map((p) => p.id)))).toBe(false);
    expect(canUseCharm(PIECES, new Set())).toBe(true);
  });
});
