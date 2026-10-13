import { describe, expect, it } from 'vitest';
import {
  animationAvailable,
  colorAvailable,
  COSMETICS,
  HABIT_ICON_GROUPS,
  HABIT_ICONS,
  iconAvailable,
} from './cosmetics';
import { EXTRA_LIST_COLORS, LIST_COLORS } from './types';

describe('cosmetics (13.12)', () => {
  it('12 colors, 4 animations and 30 locked habit icons, each sold on its own', () => {
    const count = (kind: string) => COSMETICS.filter((c) => c.kind === kind).length;
    expect([count('color'), count('animation'), count('icon')]).toEqual([12, 4, 30]);
    expect(new Set(COSMETICS.map((c) => c.id)).size).toBe(COSMETICS.length);
  });

  it('60 habit icons in groups, 30 free', () => {
    expect(HABIT_ICONS).toHaveLength(60);
    expect(HABIT_ICONS.filter((i) => i.free)).toHaveLength(30);
    expect(new Set(HABIT_ICONS.map((i) => i.name)).size).toBe(60);
    for (const group of HABIT_ICON_GROUPS) {
      expect(HABIT_ICONS.some((i) => i.group === group && i.free)).toBe(true);
    }
  });

  it('extra colors differ from the base 12', () => {
    for (const color of EXTRA_LIST_COLORS) expect(LIST_COLORS).not.toContain(color);
  });

  it('base colors and free icons are always available; extras once owned', () => {
    const none = new Set<string>();
    expect(colorAvailable(LIST_COLORS[0], none)).toBe(true);
    expect(colorAvailable('#C9B98A', none)).toBe(false);
    expect(colorAvailable('#C9B98A', new Set(['color:sand']))).toBe(true);
    expect(iconAvailable('heart', none)).toBe(true);
    expect(iconAvailable('guitar', none)).toBe(false);
    expect(iconAvailable('guitar', new Set(['icon:guitar']))).toBe(true);
    expect(iconAvailable('rocket', new Set(['icon:rocket']))).toBe(false);
    expect(animationAvailable('default', none)).toBe(true);
    expect(animationAvailable('sparks', none)).toBe(false);
    expect(animationAvailable('sparks', new Set(['animation:sparks']))).toBe(true);
  });
});
