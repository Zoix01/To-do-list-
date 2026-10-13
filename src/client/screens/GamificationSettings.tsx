import { useState, type FormEvent } from 'react';
import {
  COSMETICS,
  TICK_ANIMATION_NAMES,
  TICK_ANIMATIONS,
  animationAvailable,
  type TickAnimation,
} from '../../shared/cosmetics';
import { EXPECTED_RATE, WEEKLY_BUDGET } from '../../shared/economy';
import { shopPrices } from '../../shared/shop';
import { errorMessage } from '../lib/api';
import { useApp } from '../lib/appContext';
import { useCosmeticMutations, useOwnedCosmetics, useRewards } from '../lib/queries';
import { formatCoins } from '../lib/rewards';
import { AnimationPreview } from './habits/ShopCosmetics';
import './habits/habits.css';

/** Settings → Appearance: theme note, tick animation, unlocked cosmetics (SPEC §13.12). */
export function AppearanceSection() {
  const { canEdit } = useApp();
  const { data: rewards } = useRewards();
  const owned = useOwnedCosmetics();
  const { setTickAnimation } = useCosmeticMutations();
  const current = (rewards?.tickAnimation ?? 'default') as TickAnimation;
  const count = (kind: string) =>
    COSMETICS.filter((cosmetic) => cosmetic.kind === kind && owned.has(cosmetic.id)).length;
  const kinds: TickAnimation[] = ['default', ...TICK_ANIMATIONS];

  return (
    <section className="settings-section">
      <h2 className="section__title">Appearance</h2>
      <p className="settings-section__text">Dark theme. It is the only theme for now.</p>
      <p className="settings-section__text">Tick animation, used for every habit:</p>
      <ul className="animation-choice" role="radiogroup" aria-label="Tick animation">
        {kinds.map((kind) => {
          const available = animationAvailable(kind, owned);
          return (
            <li key={kind} className={available ? undefined : 'is-locked'}>
              <AnimationPreview kind={kind} />
              <button
                type="button"
                role="radio"
                aria-checked={current === kind}
                className="animation-choice__option"
                disabled={!canEdit || !available}
                onClick={() => setTickAnimation.mutate(kind)}
              >
                {TICK_ANIMATION_NAMES[kind]}
                {!available && <span className="muted"> · in the Shop</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="settings-section__text muted">
        Unlocked: {count('color')} of 12 extra list colors, {count('icon')} of 30 extra habit icons.
        New ones come from the Shop or mystery boxes.
      </p>
    </section>
  );
}

/** Settings → Gamification: the weekly budget and expected rate (SPEC §13.2). */
export function GamificationSection() {
  const { canEdit } = useApp();
  const { data: rewards } = useRewards();
  const { setEconomy } = useCosmeticMutations();
  const economy = rewards?.economy ?? { weeklyBudget: WEEKLY_BUDGET, expectedRate: EXPECTED_RATE };
  const [budget, setBudget] = useState(String(economy.weeklyBudget));
  const [rate, setRate] = useState(String(Math.round(economy.expectedRate * 100)));
  const [message, setMessage] = useState<string | null>(null);
  const budgetNumber = Number(budget);
  const rateNumber = Number(rate) / 100;
  const valid =
    Number.isInteger(budgetNumber) &&
    budgetNumber >= 1000 &&
    budgetNumber <= 1_000_000 &&
    rateNumber >= 0.1 &&
    rateNumber <= 1;
  const prices = valid
    ? shopPrices({ weeklyBudget: budgetNumber, expectedRate: rateNumber })
    : null;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    try {
      await setEconomy.mutateAsync({ weeklyBudget: budgetNumber, expectedRate: rateNumber });
      setMessage('Saved. Prices changed now; the budget applies from Monday.');
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  return (
    <section className="settings-section">
      <h2 className="section__title">Gamification</h2>
      <form className="economy-form" onSubmit={save}>
        <label className="economy-form__field">
          <span>Weekly budget</span>
          <input
            className="input"
            inputMode="numeric"
            value={budget}
            onChange={(event) => setBudget(event.target.value.replace(/[^0-9]/g, ''))}
            disabled={!canEdit}
          />
          <span className="muted">coins for a perfect week (1,000–1,000,000)</span>
        </label>
        <label className="economy-form__field">
          <span>Expected rate</span>
          <input
            className="input"
            inputMode="numeric"
            value={rate}
            onChange={(event) => setRate(event.target.value.replace(/[^0-9]/g, ''))}
            disabled={!canEdit}
          />
          <span className="muted">% of a perfect week you usually reach (10–100)</span>
        </label>
        <p className="settings-section__text muted">
          {prices
            ? `Prices: box ${formatCoins(prices.box)}, freeze ${formatCoins(prices.freeze)}, vacation day ${formatCoins(prices.vacation)}, cosmetic ${formatCoins(prices.cosmetic)}.`
            : 'Enter a budget of 1,000–1,000,000 and a rate of 10–100%.'}
        </p>
        {message && <p className="settings-section__text">{message}</p>}
        <button
          type="submit"
          className="button"
          disabled={!canEdit || !valid || setEconomy.isPending}
        >
          Save
        </button>
      </form>
    </section>
  );
}
