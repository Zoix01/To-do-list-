import { Check } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { formatShortDate } from '../../shared/dates';
import type { ISODate } from '../../shared/types';

export function Checkbox({
  checked,
  onChange,
  label,
  disabled,
  color,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
  /** List color for the ring; null = no list (neutral gray). */
  color?: string | null;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      className="checkbox"
      style={
        color === undefined
          ? undefined
          : ({ '--check-color': color ?? 'var(--no-list)' } as CSSProperties)
      }
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onChange();
      }}
    >
      <span className="checkbox__box">
        <Check className="checkbox__mark" size={12} strokeWidth={3} aria-hidden="true" />
      </span>
    </button>
  );
}

export function ColorDot({ color, size }: { color: string | null; size?: 'lg' }) {
  return (
    <span
      className={size === 'lg' ? 'dot dot--lg' : 'dot'}
      style={{ background: color ?? 'var(--no-list)' }}
      aria-hidden="true"
    />
  );
}

/** A button showing a date; opens the browser's native date picker. */
export function DateButton({
  value,
  onChange,
  placeholder,
  min,
  disabled,
  label,
  emphasis,
}: {
  value: ISODate | null;
  onChange: (value: ISODate) => void;
  placeholder: string;
  min?: ISODate;
  disabled?: boolean;
  label: string;
  emphasis?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const open = () => {
    const input = inputRef.current;
    if (!input) return;
    try {
      input.showPicker();
    } catch {
      input.focus();
    }
  };
  return (
    <span className="date-button">
      <button
        type="button"
        className={`button ${emphasis && !value ? 'button--outline-accent' : ''}`}
        onClick={open}
        disabled={disabled}
        aria-label={`${label}: ${value ? formatShortDate(value) : placeholder}`}
      >
        {value ? formatShortDate(value) : placeholder}
      </button>
      <input
        ref={inputRef}
        type="date"
        className="date-button__input"
        tabIndex={-1}
        aria-hidden="true"
        value={value ?? ''}
        min={min}
        disabled={disabled}
        onChange={(event) => {
          if (event.target.value) onChange(event.target.value);
        }}
      />
    </span>
  );
}

/** Button + dropdown panel; closes on outside click and Escape. */
export function Menu({
  label,
  buttonContent,
  children,
  align = 'start',
  disabled,
  closeOnSelect = true,
}: {
  label: string;
  buttonContent: ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'start' | 'end';
  disabled?: boolean;
  closeOnSelect?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);
  const close = () => setOpen(false);
  return (
    <div className="menu" ref={ref}>
      <button
        type="button"
        className="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={label}
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        {buttonContent}
      </button>
      {open && (
        <div className={`menu__panel menu__panel--${align}`} role="menu">
          {children(closeOnSelect ? close : () => {})}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  onSelect,
  selected,
  children,
  role = 'menuitemradio',
}: {
  onSelect: () => void;
  selected?: boolean;
  children: ReactNode;
  role?: 'menuitemradio' | 'menuitemcheckbox';
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={selected}
      className="menu__item"
      onClick={onSelect}
    >
      <span className="menu__check">{selected && <Check size={14} aria-hidden="true" />}</span>
      {children}
    </button>
  );
}
