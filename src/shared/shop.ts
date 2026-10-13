import {
  BOX_PRICE_SHARE,
  BOXES_PER_TYPICAL_WEEK,
  COSMETIC_PRICE_IN_BOXES,
  FREEZE_PRICE_IN_BOXES,
  PRICE_ROUNDING,
  VACATION_PRICE_IN_BOXES,
} from './economy';
import { roundTo } from './rewards';

/*
 * Shop prices and real-life rewards (SPEC §13.6). Prices follow the typical
 * week (budget × expected rate), so they change when Settings change.
 */

export interface Economy {
  weeklyBudget: number;
  expectedRate: number;
}

export interface Prices {
  box: number;
  freeze: number;
  vacation: number;
  cosmetic: number;
}

export function typicalWeek(economy: Economy): number {
  return economy.weeklyBudget * economy.expectedRate;
}

export function shopPrices(economy: Economy): Prices {
  const box = roundTo(
    (typicalWeek(economy) * BOX_PRICE_SHARE) / BOXES_PER_TYPICAL_WEEK,
    PRICE_ROUNDING,
  );
  return {
    box,
    freeze: roundTo(box * FREEZE_PRICE_IN_BOXES, PRICE_ROUNDING),
    vacation: roundTo(box * VACATION_PRICE_IN_BOXES, PRICE_ROUNDING),
    cosmetic: roundTo(box * COSMETIC_PRICE_IN_BOXES, PRICE_ROUNDING),
  };
}

/** "≈ 3 days of a typical week": price / (TYPICAL_WEEK / 7), rounded to 0.5 (13.6). */
export function priceHint(price: number, economy: Economy): string {
  const days = Math.round((price / (typicalWeek(economy) / 7)) * 2) / 2;
  if (days === 0) return '≈ less than half a day of a typical week';
  return `≈ ${days} ${days === 1 ? 'day' : 'days'} of a typical week`;
}

/** Icons for real-life rewards: Lucide names, mapped to components in the app (13.6). */
export const REWARD_ICONS = [
  'coffee',
  'cake',
  'ice-cream',
  'cookie',
  'donut',
  'candy',
  'croissant',
  'sandwich',
  'pizza',
  'utensils',
  'soup',
  'beer',
  'wine',
  'martini',
  'popcorn',
  'film',
  'tv',
  'gamepad',
  'music',
  'headphones',
  'drama',
  'ticket',
  'book',
  'shopping-bag',
  'shirt',
  'gift',
  'bed',
  'bath',
  'sofa',
  'sun',
  'plane',
  'car',
  'bike',
  'tent',
  'mountain',
  'sailboat',
  'party',
  'heart',
  'camera',
  'flower',
] as const;
export type RewardIcon = (typeof REWARD_ICONS)[number];
