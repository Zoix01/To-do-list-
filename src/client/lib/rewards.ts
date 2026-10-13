import { formatStreak } from '../../shared/habits';
import { snapshotValues, templateRules, type EconomyItem } from '../../shared/rewards';
import type {
  EarnedReward,
  HabitFrequency,
  HabitWithChecks,
  RecurringTask,
} from '../../shared/types';

const numberFormat = new Intl.NumberFormat('en-US');

/** "7,840" */
export function formatCoins(coins: number): string {
  return numberFormat.format(coins);
}

export function formatBoxes(boxes: number): string {
  return `${boxes} ${boxes === 1 ? 'box' : 'boxes'}`;
}

/** "7 days · 1 box", "50× done · 2 boxes", "Level 4 · 1 box" (SPEC §13.5). */
export function celebrationLines(reward: EarnedReward, frequency?: HabitFrequency): string[] {
  const lines = reward.milestones.map((milestone) => {
    const what =
      milestone.kind === 'count'
        ? `${milestone.threshold}× done`
        : formatStreak(milestone.threshold, frequency ?? 'daily');
    return `${what} · ${formatBoxes(milestone.boxes)}`;
  });
  for (const level of reward.levelUps) lines.push(`Level ${level} · ${formatBoxes(1)}`);
  return lines;
}

/** "+500", "+500 · 10× done · 1 box"; empty when nothing was earned. */
export function rewardText(reward: EarnedReward): string {
  return [reward.coins > 0 ? `+${formatCoins(reward.coins)}` : null, ...celebrationLines(reward)]
    .filter(Boolean)
    .join(' · ');
}

/**
 * What an item would earn per completion from next Monday, with `item` added
 * or changed among the current active items (the form hint, SPEC §13.3).
 */
export function nextWeekValue(
  item: EconomyItem,
  habits: HabitWithChecks[],
  templates: RecurringTask[],
  budget: number,
): number {
  const others: EconomyItem[] = [
    ...habits
      .filter((habit) => !habit.archived && habit.id !== item.id)
      .map((habit) => ({
        type: 'habit' as const,
        id: habit.id,
        weight: habit.weight,
        rules: habit,
      })),
    ...templates
      .filter((template) => template.active && template.id !== item.id)
      .map((template) => ({
        type: 'weekly' as const,
        id: template.id,
        weight: template.weight,
        rules: templateRules(template),
      })),
  ];
  return snapshotValues([...others, item], budget).get(`${item.type}:${item.id}`) ?? 0;
}
