import {
  TICK_ANIMATION_NAMES,
  TICK_ANIMATIONS,
  animationAvailable,
  type TickAnimation,
} from '../../../shared/cosmetics';
import { useOwnedCosmetics, useRewards } from '../../lib/queries';
import { AnimationPreview } from './ShopCosmetics';

/**
 * A habit's own tick animation (SPEC §13.12): the one from Settings, or any
 * owned animation, so different habits can tick differently.
 */
export function HabitAnimationPicker({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (animation: string | null) => void;
  disabled?: boolean;
}) {
  const owned = useOwnedCosmetics();
  const { data: rewards } = useRewards();
  const fromSettings = (rewards?.tickAnimation ?? 'default') as TickAnimation;
  const kinds: TickAnimation[] = ['default', ...TICK_ANIMATIONS].filter((kind) =>
    animationAvailable(kind, owned),
  ) as TickAnimation[];
  const shown = (value ?? fromSettings) as TickAnimation;
  return (
    <div className="habit-animation">
      <AnimationPreview key={shown} kind={shown} />
      <div className="habit-animation__options" role="radiogroup" aria-label="Tick animation">
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          className="habit-animation__option"
          disabled={disabled}
          onClick={() => onChange(null)}
        >
          As in Settings ({TICK_ANIMATION_NAMES[fromSettings]})
        </button>
        {kinds.map((kind) => (
          <button
            key={kind}
            type="button"
            role="radio"
            aria-checked={value === kind}
            className="habit-animation__option"
            disabled={disabled}
            onClick={() => onChange(kind)}
          >
            {TICK_ANIMATION_NAMES[kind]}
          </button>
        ))}
      </div>
    </div>
  );
}
