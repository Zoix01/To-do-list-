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

/** Where an icon was when tapped: lets it fly or burst even after its row is gone. */
export interface IconSnapshot {
  rect: DOMRect;
  copy: HTMLElement;
}

/** Remembers an icon (e.g. on the tap that uses an item) for an animation once the server agrees. */
export function snapshotIcon(icon: Element | null): IconSnapshot | null {
  if (!icon || prefersReducedMotion()) return null;
  const copy = icon.cloneNode(true) as HTMLElement;
  copy.classList.add('fly-icon');
  return { rect: icon.getBoundingClientRect(), copy };
}

function place({ rect, copy }: IconSnapshot): HTMLElement {
  Object.assign(copy.style, {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });
  document.body.appendChild(copy);
  return copy;
}

/**
 * Flies an icon to one of the Habits tabs, then bumps the tab: a bought item
 * lands in the Inventory, an armed freeze on the Habits (SPEC §13.10).
 */
export function flyToTab(snapshot: IconSnapshot | null, href: string): void {
  const target = document.querySelector(`.habits-nav a[href="${href}"]`);
  if (!snapshot || !target) return;
  const from = snapshot.rect;
  const to = target.getBoundingClientRect();
  const copy = place(snapshot);
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

/** A bought item flies to the Inventory tab. Skipped with reduced motion. */
export function flyToInventory(icon: Element | null): void {
  flyToTab(snapshotIcon(icon), '/habits/inventory');
}

const SPARKS = 10;

/**
 * An item used up (a real-life reward, a lucky charm): the icon rises, swells
 * and bursts into ember sparks where it was.
 */
export function burstIcon(snapshot: IconSnapshot | null): void {
  if (!snapshot) return;
  const copy = place(snapshot);
  const { rect } = snapshot;
  copy
    .animate(
      [
        { transform: 'translateY(0) scale(1)', opacity: 1 },
        { transform: 'translateY(-26px) scale(1.7)', opacity: 1, offset: 0.55 },
        { transform: 'translateY(-30px) scale(2.1)', opacity: 0 },
      ],
      { duration: 650, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' },
    )
    .finished.then(
      () => copy.remove(),
      () => copy.remove(),
    );
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2 - 26;
  for (let i = 0; i < SPARKS; i++) {
    const spark = document.createElement('span');
    spark.className = i % 3 === 0 ? 'burst-spark burst-spark--deep' : 'burst-spark';
    Object.assign(spark.style, { left: `${cx}px`, top: `${cy}px` });
    document.body.appendChild(spark);
    const angle = (i / SPARKS) * 2 * Math.PI + Math.random() * 0.4;
    const distance = 34 + Math.random() * 22;
    spark
      .animate(
        [
          { transform: 'translate(-50%, -50%) scale(0.4)', opacity: 0 },
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.15 },
          {
            transform: `translate(calc(-50% + ${Math.cos(angle) * distance}px), calc(-50% + ${Math.sin(angle) * distance}px)) scale(0.3)`,
            opacity: 0,
          },
        ],
        { duration: 700, delay: 330, easing: 'cubic-bezier(0.1, 0.6, 0.3, 1)', fill: 'backwards' },
      )
      .finished.then(
        () => spark.remove(),
        () => spark.remove(),
      );
  }
}
