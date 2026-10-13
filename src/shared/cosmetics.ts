import { EXTRA_LIST_COLORS } from './types';

/*
 * Cosmetics (SPEC §13.12): extra list colors, tick animations and habit icons.
 * Each is owned forever once bought or won; ids look like "color:sand",
 * "animation:sparks" and "icon:guitar".
 */

export const EXTRA_COLOR_NAMES: Record<(typeof EXTRA_LIST_COLORS)[number], string> = {
  '#C9B98A': 'Sand',
  '#B8C27A': 'Pear',
  '#93BC8F': 'Sage',
  '#6FB7A8': 'Seafoam',
  '#7FB4CF': 'Sky',
  '#9AA6D8': 'Cornflower',
  '#C6A0DA': 'Lilac',
  '#D490B8': 'Pink',
  '#E2A48C': 'Peach',
  '#C49A62': 'Ochre',
  '#B9AFA4': 'Stone',
  '#8FA7A0': 'Lichen',
};

/** Tick animations to unlock; "default" (sparks) is free (SPEC §13.12). */
export const TICK_ANIMATIONS = ['ink', 'leaf', 'hearts', 'notes', 'snowflakes', 'embers'] as const;
export type TickAnimation = 'default' | (typeof TICK_ANIMATIONS)[number];
export const TICK_ANIMATION_NAMES: Record<TickAnimation, string> = {
  default: 'Sparks',
  ink: 'Ink splash',
  leaf: 'Leaf',
  hearts: 'Hearts',
  notes: 'Notes',
  snowflakes: 'Snowflakes',
  embers: 'Embers',
};

/** A saved animation that no longer exists (or none) falls back to the default. */
export function normalizeAnimation(value: unknown): TickAnimation {
  return (TICK_ANIMATIONS as readonly unknown[]).includes(value)
    ? (value as TickAnimation)
    : 'default';
}

export const HABIT_ICON_GROUPS = [
  'Health',
  'Sport',
  'Learning',
  'Music & art',
  'Home',
  'Social',
  'Mind',
  'Work',
] as const;

/** 60 Lucide icons for habits, grouped; the first 30 marked free, the rest unlockable (13.12). */
export const HABIT_ICONS = [
  { name: 'heart', group: 'Health', free: true },
  { name: 'apple', group: 'Health', free: true },
  { name: 'droplet', group: 'Health', free: true },
  { name: 'pill', group: 'Health', free: true },
  { name: 'moon', group: 'Health', free: true },
  { name: 'salad', group: 'Health', free: false },
  { name: 'brain', group: 'Health', free: false },
  { name: 'stethoscope', group: 'Health', free: false },
  { name: 'dumbbell', group: 'Sport', free: true },
  { name: 'footprints', group: 'Sport', free: true },
  { name: 'bike', group: 'Sport', free: true },
  { name: 'trophy', group: 'Sport', free: false },
  { name: 'mountain', group: 'Sport', free: false },
  { name: 'timer', group: 'Sport', free: false },
  { name: 'volleyball', group: 'Sport', free: false },
  { name: 'person-standing', group: 'Sport', free: false },
  { name: 'book-open', group: 'Learning', free: true },
  { name: 'graduation-cap', group: 'Learning', free: true },
  { name: 'pencil', group: 'Learning', free: true },
  { name: 'languages', group: 'Learning', free: true },
  { name: 'library', group: 'Learning', free: false },
  { name: 'lightbulb', group: 'Learning', free: false },
  { name: 'notebook-pen', group: 'Learning', free: false },
  { name: 'code', group: 'Learning', free: false },
  { name: 'music', group: 'Music & art', free: true },
  { name: 'brush', group: 'Music & art', free: true },
  { name: 'camera', group: 'Music & art', free: true },
  { name: 'guitar', group: 'Music & art', free: false },
  { name: 'piano', group: 'Music & art', free: false },
  { name: 'mic', group: 'Music & art', free: false },
  { name: 'palette', group: 'Music & art', free: false },
  { name: 'drama', group: 'Music & art', free: false },
  { name: 'house', group: 'Home', free: true },
  { name: 'cooking-pot', group: 'Home', free: true },
  { name: 'sprout', group: 'Home', free: true },
  { name: 'shirt', group: 'Home', free: true },
  { name: 'washing-machine', group: 'Home', free: false },
  { name: 'flower', group: 'Home', free: false },
  { name: 'dog', group: 'Home', free: false },
  { name: 'cat', group: 'Home', free: false },
  { name: 'users', group: 'Social', free: true },
  { name: 'phone', group: 'Social', free: true },
  { name: 'mail', group: 'Social', free: true },
  { name: 'message-circle', group: 'Social', free: false },
  { name: 'hand-heart', group: 'Social', free: false },
  { name: 'gift', group: 'Social', free: false },
  { name: 'baby', group: 'Social', free: false },
  { name: 'sun', group: 'Mind', free: true },
  { name: 'coffee', group: 'Mind', free: true },
  { name: 'leaf', group: 'Mind', free: true },
  { name: 'feather', group: 'Mind', free: false },
  { name: 'wind', group: 'Mind', free: false },
  { name: 'flame', group: 'Mind', free: false },
  { name: 'briefcase', group: 'Work', free: true },
  { name: 'piggy-bank', group: 'Work', free: true },
  { name: 'laptop', group: 'Work', free: true },
  { name: 'list-checks', group: 'Work', free: true },
  { name: 'clock', group: 'Work', free: true },
  { name: 'wallet', group: 'Work', free: false },
  { name: 'target', group: 'Work', free: false },
] as const satisfies readonly {
  name: string;
  group: (typeof HABIT_ICON_GROUPS)[number];
  free: boolean;
}[];
export type HabitIcon = (typeof HABIT_ICONS)[number]['name'];
export const HABIT_ICON_NAMES = HABIT_ICONS.map((icon) => icon.name) as HabitIcon[];

export type CosmeticKind = 'color' | 'animation' | 'icon';

export interface Cosmetic {
  /** "color:sand", "animation:sparks", "icon:guitar" */
  id: string;
  kind: CosmeticKind;
  name: string;
  /** The color hex, animation key or icon name. */
  value: string;
}

/** Everything that can be bought or won: 12 colors, 6 animations, 30 icons (13.12). */
export const COSMETICS: readonly Cosmetic[] = [
  ...EXTRA_LIST_COLORS.map((hex) => ({
    id: `color:${EXTRA_COLOR_NAMES[hex].toLowerCase()}`,
    kind: 'color' as const,
    name: `${EXTRA_COLOR_NAMES[hex]} list color`,
    value: hex,
  })),
  ...TICK_ANIMATIONS.map((key) => ({
    id: `animation:${key}`,
    kind: 'animation' as const,
    name: `${TICK_ANIMATION_NAMES[key]} tick animation`,
    value: key,
  })),
  ...HABIT_ICONS.filter((icon) => !icon.free).map((icon) => ({
    id: `icon:${icon.name}`,
    kind: 'icon' as const,
    name: `${icon.name.replace(/-/g, ' ')} habit icon`,
    value: icon.name,
  })),
];

export function findCosmetic(id: string): Cosmetic | undefined {
  return COSMETICS.find((cosmetic) => cosmetic.id === id);
}

/** A color usable for lists and habits: a base color, or an extra one I own. */
export function colorAvailable(color: string, owned: ReadonlySet<string>): boolean {
  const extra = COSMETICS.find((c) => c.kind === 'color' && c.value === color);
  return !extra || owned.has(extra.id);
}

/** A habit icon I can choose: a free one or an unlocked one. */
export function iconAvailable(icon: string, owned: ReadonlySet<string>): boolean {
  const entry = HABIT_ICONS.find((i) => i.name === icon);
  return Boolean(entry && (entry.free || owned.has(`icon:${icon}`)));
}

export function animationAvailable(animation: string, owned: ReadonlySet<string>): boolean {
  return animation === 'default' || owned.has(`animation:${animation}`);
}
