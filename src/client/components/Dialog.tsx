import { useEffect, useRef, type ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name; shown as the dialog heading unless `hideTitle`. */
  title: string;
  hideTitle?: boolean;
  /**
   * "sheet" slides up from the bottom on phones; "drawer" comes in from the left;
   * "full" nearly fills the screen (an artwork).
   */
  variant?: 'sheet' | 'drawer' | 'full';
  children: ReactNode;
}

/** Modal built on the native <dialog> element (focus trap, Escape, top layer). */
export function Dialog({
  open,
  onClose,
  title,
  hideTitle,
  variant = 'sheet',
  children,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`dialog dialog--${variant}`}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A click on the element itself (not its content) is a click on the backdrop.
        if (event.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="dialog__content">
          {!hideTitle && <h2 className="dialog__title">{title}</h2>}
          {children}
        </div>
      )}
    </dialog>
  );
}

interface ConfirmProps {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
}: ConfirmProps) {
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      {message && <p className="dialog__text">{message}</p>}
      <div className="dialog__actions">
        <button type="button" className="button" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className={danger ? 'button button--danger' : 'button button--primary'}
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
