import { describe, expect, it } from 'vitest';
import { EXPECTED_RATE, WEEKLY_BUDGET } from './economy';
import { priceHint, REWARD_ICONS, shopPrices } from './shop';

const defaults = { weeklyBudget: WEEKLY_BUDGET, expectedRate: EXPECTED_RATE };

describe('shop prices (13.6)', () => {
  it('match the table at the defaults', () => {
    expect(shopPrices(defaults)).toEqual({ box: 600, freeze: 600, vacation: 300, cosmetic: 1800 });
  });
  it('follow the settings', () => {
    expect(shopPrices({ weeklyBudget: 20000, expectedRate: 0.5 }).box).toBe(900); // 875 → 900
  });
});

describe('price hint', () => {
  it('days of a typical week, rounded to 0.5', () => {
    expect(priceHint(3000, defaults)).toBe('≈ 3 days of a typical week');
    expect(priceHint(1000, defaults)).toBe('≈ 1 day of a typical week');
    expect(priceHint(1300, defaults)).toBe('≈ 1.5 days of a typical week');
    expect(priceHint(100, defaults)).toBe('≈ less than half a day of a typical week');
  });
});

describe('reward icons', () => {
  it('about 40, no duplicates', () => {
    expect(REWARD_ICONS.length).toBe(40);
    expect(new Set(REWARD_ICONS).size).toBe(40);
  });
});
