import { useState, type ReactNode } from 'react';

/**
 * A Buy button that answers the tap (SPEC §13.10): it presses in and waits for
 * the server; the bought item then flies to the Inventory tab (see ShopScreen).
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
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      className={pending ? 'button buy-button is-pending' : 'button buy-button'}
      disabled={disabled || pending}
      title={title}
      aria-label={label}
      onClick={() => {
        setPending(true);
        const done = () => setPending(false);
        onBuy().then(done, done);
      }}
    >
      {children}
    </button>
  );
}
