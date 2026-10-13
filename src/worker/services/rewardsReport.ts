import { seasonsFrom } from '../../shared/seasonData';
import { currentSeason, daysLeft, piecesOf } from '../../shared/seasons';
import type { ISODate } from '../../shared/types';
import { inventoryView } from './inventory';
import { loadOwnedPieces } from './boxes';
import { prepareRewards, rewardsSummary, type RewardsContext } from './rewards';

/*
 * The Claude connector's read-only view of the gamification (SPEC §13.15).
 * Artwork titles of the current season are only named once complete, as in
 * the Gallery, so the collection stays a surprise.
 */

export async function rewardsReport(ctx: RewardsContext, from: ISODate, to: ISODate) {
  await prepareRewards(ctx);
  const summary = await rewardsSummary(ctx);
  const season = currentSeason(seasonsFrom(ctx.start), ctx.today);
  const owned = new Set((await loadOwnedPieces(ctx.db)).map((piece) => piece.pieceId));
  const { items, history } = await inventoryView(ctx.db, ctx.today);
  const count = (type: string, status: string) =>
    items.filter((item) => item.type === type && item.status === status).length;

  return {
    today: ctx.today,
    rewardsStart: summary.start,
    started: summary.started,
    level: summary.level,
    xp: summary.xp,
    xpIntoLevel: summary.xpIntoLevel,
    xpForNextLevel: summary.xpForNext,
    coins: summary.coins,
    shards: summary.shards,
    thisWeek: {
      weekStart: summary.week.start,
      earned: summary.week.earned,
      budget: summary.week.budget,
    },
    season: season && {
      name: season.name,
      start: season.start,
      end: season.end,
      daysLeft: daysLeft(season, ctx.today),
      piecesOwned: piecesOf(season).filter((piece) => owned.has(piece.id)).length,
      piecesTotal: piecesOf(season).length,
      artworks: season.artworks.map((artwork, index) => {
        const pieces = piecesOf(season).filter((piece) => piece.artworkId === artwork.id);
        const have = pieces.filter((piece) => owned.has(piece.id)).length;
        const complete = have === pieces.length;
        return {
          artwork: complete ? `${artwork.title} (${artwork.artist})` : `Artwork ${index + 1}`,
          piecesOwned: have,
          piecesTotal: pieces.length,
          complete,
        };
      }),
    },
    inventory: {
      mysteryBoxes: count('box', 'owned'),
      streakFreezes: count('freeze', 'owned'),
      armedFreezes: count('freeze', 'armed'),
      vacationDays: count('vacation', 'owned'),
      plannedVacationDays: items
        .filter((item) => item.type === 'vacation' && item.status === 'scheduled')
        .map((item) => String(item.payload?.date))
        .sort(),
      luckyCharms: count('charm', 'owned') + count('charm', 'armed'),
      realLifeRewards: items
        .filter((item) => item.type === 'reward' && item.status === 'owned')
        .map((item) => String(item.payload?.name)),
    },
    events: history
      .filter((entry) => entry.date >= from && entry.date <= to)
      .map((entry) => ({
        date: entry.date,
        kind: entry.kind,
        name: entry.name,
        coins: entry.coins || undefined,
        shards: entry.shards || undefined,
        boxes: entry.boxes || undefined,
        detail: entry.detail ?? undefined,
      })),
  };
}
