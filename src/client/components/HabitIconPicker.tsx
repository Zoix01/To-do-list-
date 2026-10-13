import { Lock } from 'lucide-react';
import { HABIT_ICON_GROUPS, HABIT_ICONS, iconAvailable } from '../../shared/cosmetics';
import { HABIT_ICON_COMPONENTS } from '../lib/habitIcons';
import { useOwnedCosmetics } from '../lib/queries';

/**
 * Habit icon picker (SPEC §13.12): 60 Lucide icons in groups; locked ones show
 * a lock and can't be chosen until unlocked in the Shop or from a box.
 */
export function HabitIconPicker({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (icon: string | null) => void;
  disabled?: boolean;
}) {
  const owned = useOwnedCosmetics();
  return (
    <div className="habit-icons" role="radiogroup" aria-label="Icon">
      <button
        type="button"
        role="radio"
        aria-checked={value === null}
        className="habit-icons__none"
        disabled={disabled}
        onClick={() => onChange(null)}
      >
        No icon
      </button>
      {HABIT_ICON_GROUPS.map((group) => (
        <div key={group} className="habit-icons__group">
          <span className="habit-icons__label">{group}</span>
          <div className="icon-picker">
            {HABIT_ICONS.filter((icon) => icon.group === group).map((icon) => {
              const Icon = HABIT_ICON_COMPONENTS[icon.name];
              const unlocked = iconAvailable(icon.name, owned);
              const label = icon.name.replace(/-/g, ' ');
              return (
                <button
                  key={icon.name}
                  type="button"
                  role="radio"
                  aria-checked={value === icon.name}
                  aria-label={unlocked ? label : `${label} (locked)`}
                  title={unlocked ? undefined : 'Unlock it in the Shop'}
                  className={unlocked ? 'icon-picker__option' : 'icon-picker__option is-locked'}
                  disabled={disabled || !unlocked}
                  onClick={() => onChange(icon.name)}
                >
                  <Icon size={18} aria-hidden="true" />
                  {!unlocked && <Lock size={10} aria-hidden="true" className="icon-picker__lock" />}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
