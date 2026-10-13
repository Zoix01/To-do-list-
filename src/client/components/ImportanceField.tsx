import { IMPORTANCE_LEVELS, IMPORTANCE_NAMES, type Importance } from '../../shared/economy';
import { Segmented } from './pickers';

/**
 * Importance of a habit or recurring task: its share of the weekly coin budget,
 * with a live hint of what it would earn (SPEC §13.3). Meant for a field grid.
 */
export function ImportanceField({
  value,
  onChange,
  hint,
  disabled,
}: {
  value: Importance;
  onChange: (importance: Importance) => void;
  /** e.g. "≈ 330 coins per tick from Monday" */
  hint: string | null;
  disabled?: boolean;
}) {
  return (
    <>
      <span className="field-grid__label">Importance</span>
      <div className="field-grid__value importance-field">
        <Segmented
          label="Importance"
          value={value}
          onChange={onChange}
          disabled={disabled}
          options={IMPORTANCE_LEVELS.map((level) => ({
            value: level,
            content: IMPORTANCE_NAMES[level],
          }))}
        />
        {hint && <span className="muted">{hint}</span>}
      </div>
    </>
  );
}
