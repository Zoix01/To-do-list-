import { Coins, Package, Snowflake, TreePalm } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import type { BuyInput } from '../../../shared/schemas';
import { BuyButton } from '../../components/BuyButton';
import { flyToInventory } from '../../lib/motion';
import { ScreenHeader } from '../../components/AppShell';
import { useApp } from '../../lib/appContext';
import { useRewards, useShopMutations, useShopRewards } from '../../lib/queries';
import { RewardIconView } from '../../lib/rewardIcons';
import { formatCoins } from '../../lib/rewards';
import { Link } from '../../lib/router';
import { HabitsNav } from './HabitsNav';
import { ShopCosmetics } from './ShopCosmetics';
import './habits.css';

/** A price with the coin icon. */
export function Price({ coins }: { coins: number }) {
  return (
    <span className="price" aria-label={`${formatCoins(coins)} coins`}>
      <Coins size={14} aria-hidden="true" />
      <span className="mono-figures">{formatCoins(coins)}</span>
    </span>
  );
}

function ShopRow({
  icon,
  name,
  note,
  price,
  item,
}: {
  icon: ReactNode;
  name: string;
  note?: string;
  price: number;
  item: Pick<BuyInput, 'item' | 'rewardId'>;
}) {
  const { canEdit } = useApp();
  const { data: rewards } = useRewards();
  const { buy } = useShopMutations();
  const iconRef = useRef<HTMLSpanElement>(null);
  const affordable = (rewards?.coins ?? 0) >= price;
  return (
    <li className="shop-row">
      <span className="shop-row__icon" ref={iconRef}>
        {icon}
      </span>
      <span className="shop-row__text">
        <span>{name}</span>
        {note && <span className="muted">{note}</span>}
      </span>
      <Price coins={price} />
      <BuyButton
        disabled={!canEdit || !affordable}
        title={affordable ? undefined : 'Not enough coins'}
        label={`Buy ${name}`}
        onBuy={async () => {
          await buy.mutateAsync({ ...item, name });
          // The bought item flies to the Inventory tab.
          flyToInventory(iconRef.current?.querySelector('svg') ?? null);
        }}
      />
    </li>
  );
}

/** Built-in items and my real-life rewards (SPEC §13.6, §13.10). */
export function ShopScreen() {
  const { data: rewards } = useRewards();
  const { data: shopRewards } = useShopRewards();
  const active = (shopRewards ?? []).filter((reward) => !reward.archived);
  const prices = rewards?.prices;

  return (
    <>
      <ScreenHeader title="Habits" />
      <HabitsNav />

      {prices && (
        <section className="section">
          <h2 className="section__title">Items</h2>
          <ul className="shop-list">
            <ShopRow
              icon={<Package size={18} aria-hidden="true" />}
              name="Mystery box"
              note="An art piece, coins or an item; open it in the Inventory"
              price={prices.box}
              item={{ item: 'box' }}
            />
            <ShopRow
              icon={<Snowflake size={18} aria-hidden="true" />}
              name="Streak freeze"
              note="Arm it on a habit; it saves the streak when you miss once"
              price={prices.freeze}
              item={{ item: 'freeze' }}
            />
            <ShopRow
              icon={<TreePalm size={18} aria-hidden="true" />}
              name="Vacation day"
              note="Pauses all habits for one day"
              price={prices.vacation}
              item={{ item: 'vacation' }}
            />
          </ul>
        </section>
      )}

      <section className="section">
        <div className="section__header">
          <h2 className="section__title">Your rewards</h2>
          <Link to="/habits/shop/rewards" className="button">
            Manage rewards
          </Link>
        </div>
        {shopRewards && active.length === 0 ? (
          <p className="empty">
            No rewards yet. Add treats to buy with your coins, like Sweet treat, Coffee out, Eat out
            or Skip a lecture.
          </p>
        ) : (
          <ul className="shop-list">
            {active.map((reward) => (
              <ShopRow
                key={reward.id}
                icon={<RewardIconView icon={reward.icon} size={18} />}
                name={reward.name}
                price={reward.price}
                item={{ item: 'reward', rewardId: reward.id }}
              />
            ))}
          </ul>
        )}
      </section>

      <ShopCosmetics />
    </>
  );
}
