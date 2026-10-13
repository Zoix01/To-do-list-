import { daysBetween } from './dates';
import { PAST_SEASON_PRICE_FACTOR, PIECE_SHARD_PRICES } from './economy';
import type { ISODate } from './types';

/*
 * Seasons and their art collections (SPEC §13.13). Each season is a JSON file
 * in seasons/ (loaded by seasonData.ts); adding one needs no code changes.
 */

export type Tier = 'common' | 'rare' | 'legendary';

export interface Artwork {
  id: string;
  title: string;
  artist: string;
  year: string;
  /** Path of the WebP image under public/, e.g. /art/2026-27-winter/x.webp */
  image: string;
  width: number;
  height: number;
  /** 3×2 for landscape, 2×3 for portrait. */
  cols: number;
  rows: number;
  /** Piece indexes (row by row, from 0) of the most and second most striking parts. */
  legendary: number;
  rare: number;
  source: string;
  license: string;
}

export interface Season {
  id: string;
  name: string;
  /** winter, spring, summer or autumn */
  theme: string;
  start: ISODate;
  end: ISODate;
  artworks: Artwork[];
}

export interface Piece {
  /** `${artworkId}-${index}` */
  id: string;
  seasonId: string;
  artworkId: string;
  index: number;
  tier: Tier;
}

export function piecesOf(season: Season): Piece[] {
  return season.artworks.flatMap((artwork) =>
    Array.from({ length: artwork.cols * artwork.rows }, (_, index) => ({
      id: `${artwork.id}-${index}`,
      seasonId: season.id,
      artworkId: artwork.id,
      index,
      tier:
        index === artwork.legendary
          ? ('legendary' as const)
          : index === artwork.rare
            ? ('rare' as const)
            : ('common' as const),
    })),
  );
}

/**
 * The season whose pieces boxes give today: the latest one that has started.
 * When it has ended and no newer one has started, it stays current (13.13).
 */
export function currentSeason(seasons: readonly Season[], today: ISODate): Season | null {
  let current: Season | null = null;
  for (const season of seasons)
    if (season.start <= today && (!current || season.start > current.start)) current = season;
  return current;
}

/** Seasons that have started, newest first (future ones stay a surprise). */
export function startedSeasons(seasons: readonly Season[], today: ISODate): Season[] {
  return seasons
    .filter((season) => season.start <= today)
    .sort((a, b) => b.start.localeCompare(a.start));
}

/** Days left including today; 0 once the season has ended. */
export function daysLeft(season: Season, today: ISODate): number {
  return Math.max(0, daysBetween(today, season.end) + 1);
}

export function findPiece(seasons: readonly Season[], pieceId: string): Piece | null {
  for (const season of seasons) {
    const piece = piecesOf(season).find((p) => p.id === pieceId);
    if (piece) return piece;
  }
  return null;
}

/** Shards to buy a missing piece: past seasons cost 1.5× (13.8). */
export function piecePrice(piece: Piece, current: Season | null): number {
  const base = PIECE_SHARD_PRICES[piece.tier];
  return piece.seasonId === current?.id ? base : Math.round(base * PAST_SEASON_PRICE_FACTOR);
}
