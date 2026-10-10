import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LIST_COLORS } from './types';

// Checks every text/background pair the UI uses against WCAG AA (4.5:1).
const css = readFileSync(new URL('../client/styles/tokens.css', import.meta.url), 'utf8');

function token(name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match?.[1]) throw new Error(`Token --${name} not found`);
  return match[1];
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const PAIRS: [text: string, background: string][] = [
  ['text', 'bg'],
  ['text', 'surface'],
  ['text', 'surface-raised'],
  ['text-muted', 'bg'],
  ['text-muted', 'surface'],
  ['text-muted', 'surface-raised'],
  ['accent', 'bg'],
  ['accent', 'surface'],
  ['accent', 'surface-raised'],
  ['danger', 'bg'],
  ['danger', 'surface'],
  ['warning', 'bg'],
  ['warning', 'surface'],
  ['warning', 'surface-raised'],
  ['bg', 'accent'],
  ['bg', 'danger'],
];

describe('design token contrast (WCAG AA)', () => {
  it.each(PAIRS)('%s on %s ≥ 4.5', (text, background) => {
    expect(contrast(token(text), token(background))).toBeGreaterThanOrEqual(4.5);
  });

  // Filled calendar chips use --bg text on the list color (and on --no-list gray).
  it.each([...LIST_COLORS, token('text-muted')])('--bg text on %s ≥ 4.5', (color) => {
    expect(contrast(token('bg'), color)).toBeGreaterThanOrEqual(4.5);
  });
});
