import { Check } from 'lucide-react';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { COSMETICS, type Cosmetic, type HabitIcon } from '../../../shared/cosmetics';
import { Checkbox } from '../../components/controls';
import { BuyButton } from '../../components/BuyButton';
import { TickEffect } from '../../components/TickEffect';
import { useApp } from '../../lib/appContext';
import { HABIT_ICON_COMPONENTS } from '../../lib/habitIcons';
import { useCosmeticMutations, useOwnedCosmetics, useRewards } from '../../lib/queries';
import { Price } from './ShopScreen';

/** A checkbox that plays a tick animation when pressed: the preview (SPEC §13.12). */
export function AnimationPreview({ kind }: { kind: string }) {
  const [plays, setPlays] = useState(0);
  const [checked, setChecked] = useState(false);
  return (
    <span
      className={plays && kind === 'default' ? 'habit-tick is-popping' : 'habit-tick'}
      key={kind === 'default' ? plays : undefined}
      style={{ '--habit-color': 'var(--accent)' } as CSSProperties}
    >
      <Checkbox
        checked={checked}
        color="var(--accent)"
        label="Preview"
        onChange={() => {
          setChecked(!checked);
          if (!checked) setPlays((n) => n + 1);
        }}
      />
      {plays > 0 && <TickEffect key={plays} kind={kind} color="var(--accent)" />}
    </span>
  );
}

function CosmeticTile({ cosmetic, visual }: { cosmetic: Cosmetic; visual: ReactNode }) {
  const { canEdit } = useApp();
  const { data: rewards } = useRewards();
  const owned = useOwnedCosmetics().has(cosmetic.id);
  const { buy } = useCosmeticMutations();
  const price = rewards?.prices.cosmetic ?? 0;
  const affordable = (rewards?.coins ?? 0) >= price;
  return (
    <li className="cosmetic-tile">
      <span className="cosmetic-tile__visual">{visual}</span>
      <span className="cosmetic-tile__name">
        {cosmetic.name.replace(/ (list color|tick animation|habit icon)$/, '')}
      </span>
      {owned ? (
        <span className="cosmetic-tile__owned">
          <Check size={14} aria-hidden="true" /> Owned
        </span>
      ) : (
        <BuyButton
          disabled={!canEdit || !affordable}
          label={`Buy ${cosmetic.name}`}
          title={affordable ? undefined : 'Not enough coins'}
          onBuy={() => buy.mutateAsync({ id: cosmetic.id, name: cosmetic.name })}
        >
          <Price coins={price} />
        </BuyButton>
      )}
    </li>
  );
}

/** Extra list colors, tick animations and habit icons, each sold on its own (SPEC §13.12). */
export function ShopCosmetics() {
  const of = (kind: Cosmetic['kind']) => COSMETICS.filter((cosmetic) => cosmetic.kind === kind);
  return (
    <>
      <section className="section">
        <h2 className="section__title">List colors</h2>
        <ul className="cosmetic-grid">
          {of('color').map((cosmetic) => (
            <CosmeticTile
              key={cosmetic.id}
              cosmetic={cosmetic}
              visual={<span className="cosmetic-swatch" style={{ background: cosmetic.value }} />}
            />
          ))}
        </ul>
      </section>
      <section className="section">
        <h2 className="section__title">Tick animations · tap the circle to preview</h2>
        <ul className="cosmetic-grid">
          {of('animation').map((cosmetic) => (
            <CosmeticTile
              key={cosmetic.id}
              cosmetic={cosmetic}
              visual={<AnimationPreview kind={cosmetic.value} />}
            />
          ))}
        </ul>
      </section>
      <section className="section">
        <h2 className="section__title">Habit icons</h2>
        <ul className="cosmetic-grid cosmetic-grid--icons">
          {of('icon').map((cosmetic) => {
            const Icon = HABIT_ICON_COMPONENTS[cosmetic.value as HabitIcon];
            return (
              <CosmeticTile
                key={cosmetic.id}
                cosmetic={cosmetic}
                visual={<Icon size={20} aria-hidden="true" />}
              />
            );
          })}
        </ul>
      </section>
    </>
  );
}
