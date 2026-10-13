import { ArrowDown, ArrowUp, ChevronDown, ChevronRight } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { EXPECTED_RATE, REWARD_PRICE_MAX, WEEKLY_BUDGET } from '../../../shared/economy';
import { priceHint, REWARD_ICONS, type RewardIcon } from '../../../shared/shop';
import type { ShopReward } from '../../../shared/types';
import { AddButton, ScreenHeader } from '../../components/AppShell';
import { Dialog } from '../../components/Dialog';
import { errorMessage } from '../../lib/api';
import { useApp } from '../../lib/appContext';
import { useStoredState } from '../../lib/hooks';
import { useRewards, useShopMutations, useShopRewards } from '../../lib/queries';
import { REWARD_ICON_COMPONENTS, RewardIconView } from '../../lib/rewardIcons';
import { Price } from './ShopScreen';
import './habits.css';

/** Curated Lucide icons for rewards, in a grid (SPEC §13.6). */
function RewardIconPicker({
  value,
  onChange,
  disabled,
}: {
  value: RewardIcon;
  onChange: (icon: RewardIcon) => void;
  disabled?: boolean;
}) {
  return (
    <div className="icon-picker" role="radiogroup" aria-label="Icon">
      {REWARD_ICONS.map((icon) => {
        const Icon = REWARD_ICON_COMPONENTS[icon];
        return (
          <button
            key={icon}
            type="button"
            role="radio"
            aria-checked={value === icon}
            aria-label={icon.replace('-', ' ')}
            className="icon-picker__option"
            disabled={disabled}
            onClick={() => onChange(icon)}
          >
            <Icon size={18} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

function RewardForm({ reward, onClose }: { reward?: ShopReward; onClose: () => void }) {
  const { canEdit } = useApp();
  const { data: rewards } = useRewards();
  const { create, update } = useShopMutations();
  const [name, setName] = useState(reward?.name ?? '');
  const [price, setPrice] = useState(reward ? String(reward.price) : '');
  const [icon, setIcon] = useState<RewardIcon>(reward?.icon ?? 'gift');
  const [error, setError] = useState<string | null>(null);
  const economy = rewards?.economy ?? { weeklyBudget: WEEKLY_BUDGET, expectedRate: EXPECTED_RATE };
  const priceNumber = Number(price);
  const validPrice =
    Number.isInteger(priceNumber) && priceNumber >= 1 && priceNumber <= REWARD_PRICE_MAX;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setError('Add a name');
    if (!validPrice) return setError('Enter a price in whole coins');
    setError(null);
    const fields = { name: name.trim(), price: priceNumber, icon };
    try {
      if (reward) await update.mutateAsync({ id: reward.id, changes: fields });
      else await create.mutateAsync(fields);
      onClose();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <form className="task-form" onSubmit={submit}>
      <input
        className="task-form__title"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Reward name, e.g. Coffee out"
        aria-label="Reward name"
        autoFocus={!reward}
        maxLength={60}
        disabled={!canEdit}
      />
      <div className="field-grid">
        <span className="field-grid__label">Price</span>
        <div className="field-grid__value">
          <input
            className="input reward-price"
            inputMode="numeric"
            value={price}
            onChange={(event) => setPrice(event.target.value.replace(/[^0-9]/g, ''))}
            placeholder="0"
            aria-label="Price in coins"
            disabled={!canEdit}
          />
          <span className="muted">coins</span>
          {validPrice && <span className="muted">{priceHint(priceNumber, economy)}</span>}
        </div>
        <span className="field-grid__label">Icon</span>
        <div className="field-grid__value">
          <RewardIconPicker value={icon} onChange={setIcon} disabled={!canEdit} />
        </div>
      </div>
      {error && <p className="field-error">{error}</p>}
      <div className="dialog__actions">
        {reward && (
          <button
            type="button"
            className="button button--quiet-danger dialog__actions-start"
            disabled={!canEdit}
            onClick={() => {
              update.mutate({ id: reward.id, changes: { archived: !reward.archived } });
              onClose();
            }}
          >
            {reward.archived ? 'Restore' : 'Archive'}
          </button>
        )}
        <button type="button" className="button" onClick={onClose}>
          Cancel
        </button>
        <button
          type="submit"
          className="button button--primary"
          disabled={!canEdit || create.isPending || update.isPending}
        >
          {reward ? 'Save' : 'Add reward'}
        </button>
      </div>
    </form>
  );
}

/** Add, edit, reorder and archive real-life rewards (SPEC §13.6). */
export function ManageRewardsScreen() {
  const { canEdit } = useApp();
  const { data: shopRewards } = useShopRewards();
  const { reorder } = useShopMutations();
  // undefined = closed; null = new reward.
  const [editing, setEditing] = useState<ShopReward | null | undefined>(undefined);
  const [showArchived, setShowArchived] = useStoredState('shop.showArchived', false);
  const all = shopRewards ?? [];
  const active = all.filter((reward) => !reward.archived);
  const archived = all.filter((reward) => reward.archived);

  /** Moves a reward up or down among the active ones (archived ones keep their place at the end). */
  function move(index: number, by: -1 | 1) {
    const ids = active.map((reward) => reward.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + by, 0, id!);
    reorder.mutate([...ids, ...archived.map((reward) => reward.id)]);
  }

  const row = (reward: ShopReward, index: number, list: ShopReward[]) => (
    <li key={reward.id} className="shop-row">
      <span className="shop-row__icon">
        <RewardIconView icon={reward.icon} size={18} />
      </span>
      <button
        type="button"
        className="shop-row__text shop-row__open"
        onClick={() => setEditing(reward)}
      >
        <span>{reward.name}</span>
      </button>
      <Price coins={reward.price} />
      {!reward.archived && (
        <span className="shop-row__order">
          <button
            type="button"
            className="icon-button"
            aria-label={`Move “${reward.name}” up`}
            disabled={!canEdit || index === 0}
            onClick={() => move(index, -1)}
          >
            <ArrowUp size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={`Move “${reward.name}” down`}
            disabled={!canEdit || index === list.length - 1}
            onClick={() => move(index, 1)}
          >
            <ArrowDown size={16} aria-hidden="true" />
          </button>
        </span>
      )}
    </li>
  );

  return (
    <>
      <ScreenHeader
        title="Rewards"
        back="/habits/shop"
        actions={<AddButton label="Add reward" onClick={() => setEditing(null)} />}
      />
      {shopRewards && active.length === 0 && (
        <p className="empty">
          No rewards yet. For example: Sweet treat, Coffee out, Eat out, Skip a lecture.
        </p>
      )}
      <ul className="shop-list">{active.map(row)}</ul>

      {archived.length > 0 && (
        <section className="section">
          <button
            type="button"
            className="section__title section__toggle"
            aria-expanded={showArchived}
            onClick={() => setShowArchived(!showArchived)}
          >
            {showArchived ? (
              <ChevronDown size={14} aria-hidden="true" />
            ) : (
              <ChevronRight size={14} aria-hidden="true" />
            )}
            Archived
            <span className="section__count">{archived.length}</span>
          </button>
          {showArchived && <ul className="shop-list is-archived">{archived.map(row)}</ul>}
        </section>
      )}

      <Dialog
        open={editing !== undefined}
        onClose={() => setEditing(undefined)}
        title={editing ? 'Edit reward' : 'New reward'}
        hideTitle
      >
        {editing !== undefined && (
          <RewardForm
            key={editing?.id ?? 'new'}
            reward={editing ?? undefined}
            onClose={() => setEditing(undefined)}
          />
        )}
      </Dialog>
    </>
  );
}
