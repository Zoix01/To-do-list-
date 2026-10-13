import type { Context } from 'hono';
import { Hono } from 'hono';
import type { RewardsSummary } from '../../shared/types';
import type { AppEnv } from '../env';
import { rewardsStart, rewardsSummary, type RewardsContext } from '../services/rewards';
import { testPeriod } from '../services/testMode';

export function rewardsContext(c: Context<AppEnv>): RewardsContext {
  return {
    db: c.get('db'),
    today: c.get('today'),
    timeZone: c.env.TIMEZONE,
    start: rewardsStart(c.env),
    test: testPeriod(c.env),
  };
}

/** Wallet, level and this week's earnings (SPEC §13.10). */
export const rewardRoutes = new Hono<AppEnv>().get('/', async (c) =>
  c.json<RewardsSummary>(await rewardsSummary(rewardsContext(c))),
);
