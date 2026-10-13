import { EXTRA_COLOR_NAMES, colorAvailable } from '../../shared/cosmetics';
import { ALL_LIST_COLORS, type ListColor } from '../../shared/types';
import { useOwnedCosmetics } from '../lib/queries';
import { ColorDot, Menu } from './controls';

const COLOR_NAMES: Record<ListColor, string> = {
  ...EXTRA_COLOR_NAMES,
  '#E8925A': 'Orange',
  '#A8B55E': 'Olive',
  '#7FA36B': 'Green',
  '#4FB077': 'Emerald',
  '#5FA39A': 'Teal',
  '#6A9FB5': 'Blue',
  '#7B8FC9': 'Indigo',
  '#9A82C2': 'Purple',
  '#B77CD0': 'Orchid',
  '#B87AA6': 'Plum',
  '#C98A8A': 'Rose',
  '#A08C76': 'Brown',
};

/** The 12-color palette shared by lists and habits, plus extra colors I own (SPEC §13.12). */
export function ColorPicker({
  value,
  onChange,
  disabled,
  label = 'Color',
}: {
  value: ListColor;
  onChange: (color: ListColor) => void;
  disabled?: boolean;
  label?: string;
}) {
  const owned = useOwnedCosmetics();
  // Extra colors appear after the base 12 once owned (the current one always shows).
  const colors = ALL_LIST_COLORS.filter((color) => colorAvailable(color, owned) || color === value);
  return (
    <Menu
      label={`${label}: ${COLOR_NAMES[value]}`}
      disabled={disabled}
      buttonContent={<ColorDot color={value} size="lg" />}
    >
      {(close) => (
        <div className="swatches" role="group" aria-label={label}>
          {colors.map((color) => (
            <button
              key={color}
              type="button"
              className="swatch"
              aria-label={COLOR_NAMES[color]}
              aria-pressed={color === value}
              style={{ background: color }}
              onClick={() => {
                onChange(color);
                close();
              }}
            />
          ))}
        </div>
      )}
    </Menu>
  );
}
