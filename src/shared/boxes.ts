import {
  BOX_ODDS,
  COIN_ROUNDING,
  DUPLICATE_SHARDS,
  POUCH_EXPONENT,
  POUCH_MIN,
  POUCH_SPREAD,
  TIER_ODDS,
} from './economy';
import { roundTo } from './rewards';
import type { Piece, Tier } from './seasons';

/*
 * Mystery boxes (SPEC §13.7). The server rolls with a cryptographically secure
 * random generator; tests pass a seeded one.
 */

/** Returns a number in [0, 1). */
export type Rng = () => number;

/** Cryptographically secure randomness for the server. */
export const secureRng: Rng = () => crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32;

/** A small seeded generator (mulberry32) for tests and the balance simulation. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Picks one option with probability proportional to its weight. */
export function pick<T>(rng: Rng, options: readonly (readonly [T, number])[]): T {
  const total = options.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng() * total;
  for (const [value, weight] of options) {
    if (roll < weight) return value;
    roll -= weight;
  }
  return options[options.length - 1]![0];
}

export type BoxResult =
  | { type: 'piece'; pieceId: string; tier: Tier; duplicate: boolean; shards: number }
  | { type: 'pouch'; coins: number }
  | { type: 'charm' }
  | { type: 'freeze' }
  | { type: 'vacation' }
  | { type: 'reward'; rewardId: string }
  | { type: 'cosmetic'; cosmeticId: string };

export interface BoxContext {
  /** Pieces of the current season. */
  pieces: readonly Piece[];
  owned: ReadonlySet<string>;
  /** Active real-life rewards. */
  rewards: readonly { id: string; price: number }[];
  /** Cosmetics not owned yet. */
  unownedCosmetics: readonly string[];
  /** A lucky charm is armed: this box gives a piece not owned yet. */
  charm: boolean;
  boxPrice: number;
}

/** box price × (0.1 + 4.9 × u^2.5), rounded: 0.1–5×, mean 1.5×, median ≈ 1× (13.7). */
export function pouchCoins(rng: Rng, boxPrice: number): number {
  const factor = POUCH_MIN + POUCH_SPREAD * rng() ** POUCH_EXPONENT;
  return Math.max(COIN_ROUNDING, roundTo(boxPrice * factor, COIN_ROUNDING));
}

const TIERS: Tier[] = ['common', 'rare', 'legendary'];

/** An art piece: tier first, then a piece of that tier, owned or not (13.7). */
export function rollPiece(
  rng: Rng,
  pieces: readonly Piece[],
  owned: ReadonlySet<string>,
  onlyUnowned = false,
): BoxResult {
  const pool = onlyUnowned ? pieces.filter((piece) => !owned.has(piece.id)) : pieces;
  // Tiers that still have pieces to pick from, odds renormalized (the lucky charm case).
  const tiers = TIERS.filter((tier) => pool.some((piece) => piece.tier === tier));
  const tier = pick(
    rng,
    tiers.map((t) => [t, TIER_ODDS[t]] as const),
  );
  const ofTier = pool.filter((piece) => piece.tier === tier);
  const piece = ofTier[Math.floor(rng() * ofTier.length)]!;
  const duplicate = owned.has(piece.id);
  return {
    type: 'piece',
    pieceId: piece.id,
    tier,
    duplicate,
    shards: duplicate ? DUPLICATE_SHARDS[tier] : 0,
  };
}

/** The lucky charm can't be used once every piece of the season is owned (13.7). */
export function canUseCharm(pieces: readonly Piece[], owned: ReadonlySet<string>): boolean {
  return pieces.some((piece) => !owned.has(piece.id));
}

/** Opens one box: exactly one result, with the spec's fallbacks to a coin pouch. */
export function openBox(rng: Rng, context: BoxContext): BoxResult {
  if (context.charm && canUseCharm(context.pieces, context.owned)) {
    return rollPiece(rng, context.pieces, context.owned, true);
  }
  const kind = pick(rng, Object.entries(BOX_ODDS) as [keyof typeof BOX_ODDS, number][]);
  const pouch = (): BoxResult => ({ type: 'pouch', coins: pouchCoins(rng, context.boxPrice) });
  switch (kind) {
    case 'piece':
      return context.pieces.length > 0 ? rollPiece(rng, context.pieces, context.owned) : pouch();
    case 'pouch':
      return pouch();
    case 'charm':
    case 'freeze':
    case 'vacation':
      return { type: kind };
    case 'reward': {
      // Cheaper rewards come up more often: weight 1 / price.
      if (context.rewards.length === 0) return pouch();
      const rewardId = pick(
        rng,
        context.rewards.map((r) => [r.id, 1 / r.price] as const),
      );
      return { type: 'reward', rewardId };
    }
    case 'cosmetic': {
      if (context.unownedCosmetics.length === 0) return pouch();
      const cosmeticId =
        context.unownedCosmetics[Math.floor(rng() * context.unownedCosmetics.length)]!;
      return { type: 'cosmetic', cosmeticId };
    }
  }
}
