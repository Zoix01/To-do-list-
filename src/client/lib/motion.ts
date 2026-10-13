import { useEffect, useRef, useState } from 'react';

export function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/** A number that counts towards its new value instead of jumping (e.g. coins after buying). */
export function useAnimatedNumber(value: number, duration = 700): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    if (start === value || prefersReducedMotion()) {
      from.current = value;
      setShown(value);
      return;
    }
    const began = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - began) / duration);
      const eased = 1 - (1 - t) ** 3;
      const current = Math.round(start + (value - start) * eased);
      from.current = current;
      setShown(current);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);
  return shown;
}

/**
 * Flies a copy of an icon from where it is to the Inventory tab, then bumps the
 * tab (a bought item "lands" in the Inventory). Skipped with reduced motion.
 */
export function flyToInventory(icon: Element | null): void {
  const target = document.querySelector('.habits-nav a[href="/habits/inventory"]');
  if (!icon || !target || prefersReducedMotion()) return;
  const from = icon.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  const copy = icon.cloneNode(true) as HTMLElement;
  copy.classList.add('fly-icon');
  Object.assign(copy.style, {
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
  });
  document.body.appendChild(copy);
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const flight = copy.animate(
    [
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      {
        transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 60}px) scale(1.5)`,
        opacity: 1,
        offset: 0.45,
      },
      { transform: `translate(${dx}px, ${dy}px) scale(0.6)`, opacity: 0.2 },
    ],
    { duration: 750, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
  );
  flight.onfinish = () => {
    copy.remove();
    target.classList.remove('is-receiving');
    // Restart the bump even when several items land in a row.
    void (target as HTMLElement).offsetWidth;
    target.classList.add('is-receiving');
  };
}
