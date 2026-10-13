import { Leaf } from 'lucide-react';
import type { CSSProperties } from 'react';

/**
 * The cosmetic tick animations (SPEC §13.12), drawn around a checkbox:
 * sparks, ripple, ink splash or leaf. "default" draws nothing extra (the
 * checkbox's own pop). Remount (change the key) to play it again.
 */
export function TickEffect({ kind, color }: { kind: string; color: string }) {
  if (kind === 'default') return null;
  const style = { '--effect-color': color } as CSSProperties;
  return (
    <span className={`tick-effect tick-effect--${kind}`} style={style} aria-hidden="true">
      {kind === 'sparks' &&
        Array.from({ length: 8 }, (_, i) => (
          <span
            key={i}
            className="tick-effect__spark"
            style={{ '--angle': `${i * 45}deg` } as CSSProperties}
          />
        ))}
      {kind === 'ripple' && (
        <>
          <span className="tick-effect__ring" />
          <span className="tick-effect__ring tick-effect__ring--late" />
        </>
      )}
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
    </span>
  );
}
