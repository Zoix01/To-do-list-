import { Flame, Heart, Leaf, Music, Snowflake, type LucideIcon } from 'lucide-react';
import type { CSSProperties } from 'react';

/** Small icons that float away from the checkbox: [icon, x, y, rotation] per piece. */
const FLOATS: Record<string, { icon: LucideIcon; pieces: [number, number, number][] }> = {
  hearts: {
    icon: Heart,
    pieces: [
      [-12, -18, -15],
      [2, -24, 5],
      [14, -16, 20],
    ],
  },
  notes: {
    icon: Music,
    pieces: [
      [-14, -16, -20],
      [12, -22, 15],
    ],
  },
  snowflakes: {
    icon: Snowflake,
    pieces: [
      [-13, 14, 90],
      [0, -18, -90],
      [14, 12, 120],
    ],
  },
  embers: {
    icon: Flame,
    pieces: [
      [-8, -20, -10],
      [9, -26, 10],
    ],
  },
};

/**
 * The tick animations (SPEC §13.12), drawn around a checkbox: sparks (the
 * default), ink splash, leaf, hearts, notes, snowflakes or embers. Remount
 * (change the key) to play it again.
 */
export function TickEffect({ kind, color }: { kind: string; color: string }) {
  const style = { '--effect-color': color } as CSSProperties;
  const float = FLOATS[kind];
  return (
    <span className={`tick-effect tick-effect--${kind}`} style={style} aria-hidden="true">
      {(kind === 'default' || !(kind in FLOATS || kind === 'ink' || kind === 'leaf')) &&
        Array.from({ length: 8 }, (_, i) => (
          <span
            key={i}
            className="tick-effect__spark"
            style={{ '--angle': `${i * 45}deg` } as CSSProperties}
          />
        ))}
      {kind === 'ink' && (
        <>
          <span className="tick-effect__blot" />
          <span className="tick-effect__drop tick-effect__drop--a" />
          <span className="tick-effect__drop tick-effect__drop--b" />
          <span className="tick-effect__drop tick-effect__drop--c" />
        </>
      )}
      {kind === 'leaf' && (
        <span className="tick-effect__leaf">
          <Leaf size={14} />
        </span>
      )}
      {float &&
        float.pieces.map(([x, y, rotation], i) => (
          <span
            key={i}
            className="tick-effect__float"
            style={
              {
                '--dx': `${x}px`,
                '--dy': `${y}px`,
                '--rot': `${rotation}deg`,
                animationDelay: `${i * 70}ms`,
              } as CSSProperties
            }
          >
            <float.icon size={11} fill={kind === 'hearts' ? 'currentColor' : 'none'} />
          </span>
        ))}
    </span>
  );
}
