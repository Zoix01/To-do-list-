import { Minus, Plus } from 'lucide-react';
import { WEIGHT_MAX, WEIGHT_MIN } from '../../shared/economy';

/**
 * Weight 1–10 of a habit or weekly task: its share of the weekly coin budget,
 * with a live hint of what it would earn (SPEC §13.3). Meant for a field grid.
 */
export function WeightField({
  value,
  onChange,
  hint,
  disabled,
}: {
  value: number;
  onChange: (weight: number) => void;
  /** e.g. "≈ 330 coins per tick from Monday" */
  hint: string | null;
  disabled?: boolean;
}) {
  return (
    <>
      <span className="field-grid__label">Weight</span>
      <div className="field-grid__value">
        <div className="stepper" role="group" aria-label="Weight">
          <button
            type="button"
            className="icon-button"
            aria-label="Lower weight"
            disabled={disabled || value <= WEIGHT_MIN}
            onClick={() => onChange(Math.max(WEIGHT_MIN, value - 1))}
          >
            <Minus size={16} aria-hidden="true" />
          </button>
          <span className="stepper__value mono" aria-live="polite">
            {value}
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label="Higher weight"
            disabled={disabled || value >= WEIGHT_MAX}
            onClick={() => onChange(Math.min(WEIGHT_MAX, value + 1))}
          >
            <Plus size={16} aria-hidden="true" />
          </button>
        </div>
        {hint && <span className="muted">{hint}</span>}
      </div>
    </>
  );
}
