import { Check } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

/**
 * A Buy button that answers the tap (SPEC §13.10): it presses in, waits for
 * the server, then flashes "Bought" in the darker ember for a moment.
 */
export function BuyButton({
  onBuy,
  disabled,
  title,
  label,
  children = 'Buy',
}: {
  /** Resolves when bought; rejects when not (the error is shown elsewhere). */
  onBuy: () => Promise<unknown>;
  disabled?: boolean;
  title?: string;
  label?: string;
  children?: ReactNode;
}) {
  const [state, setState] = useState<'idle' | 'pending' | 'bought'>('idle');

  useEffect(() => {
    if (state !== 'bought') return;
    const timer = window.setTimeout(() => setState('idle'), 1300);
    return () => window.clearTimeout(timer);
  }, [state]);

  return (
    <button
      type="button"
      className={`button buy-button is-${state}`}
      disabled={disabled || state !== 'idle'}
      title={title}
      aria-label={label}
      aria-live="polite"
      onClick={() => {
        setState('pending');
        onBuy().then(
          () => setState('bought'),
          () => setState('idle'),
        );
      }}
    >
      {state === 'bought' ? (
        <>
          <Check size={14} aria-hidden="true" /> Bought
        </>
      ) : (
        children
      )}
    </button>
  );
}
