import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

interface Toast {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
}

interface FeedbackValue {
  /** Toasts are only used for undo (SPEC §14). */
  showUndo: (message: string, undo: () => void) => void;
  /** Shows a one-line error under the screen header until dismissed or replaced. */
  showError: (message: string) => void;
  error: string | null;
  clearError: () => void;
}

const FeedbackContext = createContext<FeedbackValue | null>(null);
const TOAST_MS = 5000;

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nextId = useRef(0);

  const showUndo = useCallback((message: string, undo: () => void) => {
    nextId.current += 1;
    setToast({ id: nextId.current, message, action: { label: 'Undo', run: undo } });
  }, []);
  const showError = useCallback((message: string) => setError(message), []);
  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return (
    <FeedbackContext.Provider value={{ showUndo, showError, error, clearError }}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {toast && (
          <div className="toast" key={toast.id}>
            <span>{toast.message}</span>
            {toast.action && (
              <>
                <span className="toast__sep" aria-hidden="true">
                  ·
                </span>
                <button
                  type="button"
                  className="toast__action"
                  onClick={() => {
                    toast.action?.run();
                    setToast(null);
                  }}
                >
                  {toast.action.label}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackValue {
  const value = useContext(FeedbackContext);
  if (!value) throw new Error('useFeedback outside FeedbackProvider');
  return value;
}
