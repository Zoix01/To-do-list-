import { Clover, Package, Snowflake, TreePalm } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { dateInZone, formatShortDate } from '../../../shared/dates';
import { formatStreak } from '../../../shared/habits';
import type { RewardIcon } from '../../../shared/shop';
import type { HabitFrequency, HistoryEntry, InventoryItem } from '../../../shared/types';
import { ScreenHeader } from '../../components/AppShell';
import { Dialog } from '../../components/Dialog';
import { useApp } from '../../lib/appContext';
import { useHabits, useInventory, useInventoryMutations } from '../../lib/queries';
import { RewardIconView } from '../../lib/rewardIcons';
import { formatBoxes, formatCoins } from '../../lib/rewards';
import { BoxOpenDialog } from './BoxOpenDialog';
import { HabitsNav } from './HabitsNav';
import './habits.css';

function ItemRow({
  icon,
  name,
  note,
  count,
  action,
}: {
  icon: ReactNode;
  name: string;
  note?: ReactNode;
  count?: number;
  action?: ReactNode;
}) {
  return (
    <li className="shop-row">
      <span className="shop-row__icon">{icon}</span>
      <span className="shop-row__text">
        <span>
          {name}
          {count !== undefined && count > 1 && (
            <span className="muted mono-figures"> ×{count}</span>
          )}
        </span>
        {note && <span className="muted">{note}</span>}
      </span>
      {action}
    </li>
  );
}

/** Pick the habit a freeze protects (SPEC §13.9). */
function ArmDialog({ freeze, onClose }: { freeze: InventoryItem | null; onClose: () => void }) {
  const { data: habits } = useHabits();
  const { arm } = useInventoryMutations();
  const active = (habits ?? []).filter((habit) => !habit.archived);
  return (
    <Dialog open={freeze !== null} onClose={onClose} title="Arm a streak freeze">
      <p className="muted">
        The freeze waits on the habit and saves its streak the next time a day, week or month is
        missed.
      </p>
      <ul className="choice-list">
        {active.map((habit) => (
          <li key={habit.id}>
            <button
              type="button"
              className="choice-list__option"
              onClick={() => {
                if (freeze) arm.mutate({ id: freeze.id, habitId: habit.id });
                onClose();
              }}
            >
              <span className="dot" style={{ background: habit.color }} aria-hidden="true" />
              {habit.name}
              {habit.armedFreezes > 0 && (
                <span className="muted"> · {habit.armedFreezes} armed</span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {active.length === 0 && <p className="empty">No habits to protect yet.</p>}
      <div className="dialog__actions">
        <button type="button" className="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Dialog>
  );
}

/** Pick the day of a vacation day: today or later, one not taken yet. */
function VacationDialog({ item, onClose }: { item: InventoryItem | null; onClose: () => void }) {
  const { today } = useApp();
  const { planVacation } = useInventoryMutations();
  const [date, setDate] = useState(today);
  return (
    <Dialog open={item !== null} onClose={onClose} title="Plan a vacation day">
      <p className="muted">On that day all habits are paused. Recurring tasks are not.</p>
      <input
        type="date"
        className="input vacation-date"
        value={date}
        min={today}
        onChange={(event) => setDate(event.target.value)}
        aria-label="Vacation day"
      />
      <div className="dialog__actions">
        <button type="button" className="button" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="button button--primary"
          disabled={!date || date < today}
          onClick={() => {
            if (item) planVacation.mutate({ id: item.id, date });
            onClose();
          }}
        >
          Plan
        </button>
      </div>
    </Dialog>
  );
}

const BOX_RESULTS: Record<string, (entry: HistoryEntry) => string> = {
  piece: (e) => `${String(e.detail?.tier)} piece${e.detail?.duplicate ? ' (duplicate)' : ''}`,
  pouch: () => 'coin pouch',
  charm: () => 'lucky charm',
  freeze: () => 'streak freeze',
  vacation: () => 'vacation day',
  reward: (e) => e.name ?? 'real-life reward',
  cosmetic: () => 'cosmetic',
};

const ACTIONS: Record<string, (entry: HistoryEntry) => string> = {
  arm: (e) => `Freeze armed on ${e.name ?? 'a habit'}`,
  unarm: (e) => `Freeze taken back from ${e.name ?? 'a habit'}`,
  freeze_used: (e) =>
    `Freeze saved ${e.name ?? 'a habit'}’s streak (${formatShortDate(String(e.detail?.periodStart))})`,
  freeze_returned: (e) => `Freeze returned to ${e.name ?? 'a habit'}`,
  vacation: (e) => `Vacation day planned for ${formatShortDate(String(e.detail?.date))}`,
  vacation_cancelled: (e) => `Vacation day on ${formatShortDate(String(e.detail?.date))} cancelled`,
  reward_used: (e) => `Used ${e.name ?? 'a reward'}`,
  charm: () => 'Lucky charm activated',
};

/** One History line: what happened, and coins or boxes gained or spent. */
function historyText(entry: HistoryEntry): string {
  switch (entry.kind) {
    case 'ticks':
      return `Habit ticks${Number(entry.detail?.count) > 1 ? ` (${entry.detail?.count})` : ''}`;
    case 'weekly':
      return entry.name ?? 'Recurring task';
    case 'streak':
      return `${entry.name ?? 'Habit'}: ${formatStreak(
        Number(entry.detail?.threshold),
        (entry.detail?.frequency as HabitFrequency | undefined) ?? 'daily',
      )} streak`;
    case 'count':
      return `${entry.name ?? 'Habit'}: ${entry.detail?.threshold}× done`;
    case 'level':
      return `Level ${entry.detail?.level}`;
    case 'buy':
      return `Bought ${entry.name ?? 'an item'}`;
    case 'refund':
      return `Undid buying ${entry.name ?? 'an item'}`;
    case 'use':
      return ACTIONS[String(entry.detail?.action)]?.(entry) ?? 'Used an item';
    case 'box':
      return `Mystery box: ${BOX_RESULTS[String(entry.detail?.type)]?.(entry) ?? 'opened'}`;
    case 'shards':
      return `Bought a ${String(entry.detail?.tier ?? '')} piece with shards`;
  }
}

function History({ entries }: { entries: HistoryEntry[] }) {
  if (entries.length === 0) return <p className="empty">Nothing yet.</p>;
  return (
    <ul className="history">
      {entries.map((entry) => (
        <li key={entry.key} className="history__row">
          <span className="history__date muted">{formatShortDate(entry.date)}</span>
          <span className="history__text">{historyText(entry)}</span>
          <span className="history__amount mono-figures">
            {entry.coins !== 0 && (
              <span className={entry.coins > 0 ? 'is-gain' : undefined}>
                {entry.coins > 0 ? '+' : '−'}
                {formatCoins(Math.abs(entry.coins))}
              </span>
            )}
            {entry.shards !== 0 && (
              <span className={entry.shards > 0 ? 'is-gain' : undefined}>
                {' '}
                {entry.shards > 0 ? '+' : '−'}
                {Math.abs(entry.shards)} shards
              </span>
            )}
            {entry.boxes > 0 && <span className="muted"> {formatBoxes(entry.boxes)}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Boxes, freezes, vacation days and bought rewards, plus the History (SPEC §13.10). */
export function InventoryScreen() {
  const { today, timeZone, canEdit } = useApp();
  const { data: inventory } = useInventory();
  const { data: habits } = useHabits();
  const { unarm, cancelVacation, useReward, useCharm } = useInventoryMutations();
  const [openingBox, setOpeningBox] = useState<string | null>(null);
  const [arming, setArming] = useState<InventoryItem | null>(null);
  const [planning, setPlanning] = useState<InventoryItem | null>(null);
  const items = inventory?.items ?? [];
  const of = (type: InventoryItem['type'], status: InventoryItem['status']) =>
    items.filter((item) => item.type === type && item.status === status);
  const habitName = (id: unknown) => habits?.find((habit) => habit.id === id)?.name ?? 'a habit';

  const boxes = of('box', 'owned');
  const freezes = of('freeze', 'owned');
  const armed = of('freeze', 'armed');
  const vacations = of('vacation', 'owned');
  const planned = of('vacation', 'scheduled').sort((a, b) =>
    String(a.payload?.date).localeCompare(String(b.payload?.date)),
  );
  const rewards = of('reward', 'owned');
  const charms = of('charm', 'owned');
  const activeCharm = of('charm', 'armed')[0];
  const nextBox = boxes.find((box) => box.id !== openingBox);
  const empty = inventory && items.length === 0;

  return (
    <>
      <ScreenHeader title="Habits" />
      <HabitsNav />

      {empty && (
        <p className="empty">
          Nothing here yet. Buy items in the Shop; milestones and level-ups add mystery boxes.
        </p>
      )}

      {boxes.length > 0 && (
        <section className="section">
          <h2 className="section__title">Mystery boxes</h2>
          <ul className="shop-list">
            <ItemRow
              icon={<Package size={18} aria-hidden="true" />}
              name="Mystery box"
              count={boxes.length}
              action={
                <button
                  type="button"
                  className="button"
                  disabled={!canEdit}
                  onClick={() => setOpeningBox(boxes[0]!.id)}
                >
                  Open
                </button>
              }
            />
          </ul>
        </section>
      )}

      {(freezes.length > 0 || armed.length > 0) && (
        <section className="section">
          <h2 className="section__title">Freezes</h2>
          <ul className="shop-list">
            {freezes.length > 0 && (
              <ItemRow
                icon={<Snowflake size={18} aria-hidden="true" />}
                name="Streak freeze"
                count={freezes.length}
                action={
                  <button
                    type="button"
                    className="button"
                    disabled={!canEdit}
                    onClick={() => setArming(freezes[0]!)}
                  >
                    Use
                  </button>
                }
              />
            )}
            {armed.map((item) => (
              <ItemRow
                key={item.id}
                icon={<Snowflake size={18} aria-hidden="true" className="is-armed" />}
                name={`Armed on ${habitName(item.payload?.habitId)}`}
                note={`Since ${formatShortDate(String(item.payload?.armedOn))}`}
                action={
                  <button
                    type="button"
                    className="button"
                    disabled={!canEdit}
                    onClick={() => unarm.mutate(item.id)}
                  >
                    Take back
                  </button>
                }
              />
            ))}
          </ul>
        </section>
      )}

      {(vacations.length > 0 || planned.length > 0) && (
        <section className="section">
          <h2 className="section__title">Vacation days</h2>
          <ul className="shop-list">
            {vacations.length > 0 && (
              <ItemRow
                icon={<TreePalm size={18} aria-hidden="true" />}
                name="Vacation day"
                count={vacations.length}
                action={
                  <button
                    type="button"
                    className="button"
                    disabled={!canEdit}
                    onClick={() => setPlanning(vacations[0]!)}
                  >
                    Use
                  </button>
                }
              />
            )}
            {planned.map((item) => {
              const date = String(item.payload?.date);
              return (
                <ItemRow
                  key={item.id}
                  icon={<TreePalm size={18} aria-hidden="true" />}
                  name={date === today ? 'Vacation today' : `Vacation on ${formatShortDate(date)}`}
                  action={
                    date > today && (
                      <button
                        type="button"
                        className="button"
                        disabled={!canEdit}
                        onClick={() => cancelVacation.mutate(item.id)}
                      >
                        Cancel
                      </button>
                    )
                  }
                />
              );
            })}
          </ul>
        </section>
      )}

      {(charms.length > 0 || activeCharm) && (
        <section className="section">
          <h2 className="section__title">Lucky charms</h2>
          <ul className="shop-list">
            {activeCharm && (
              <ItemRow
                icon={<Clover size={18} aria-hidden="true" className="is-armed" />}
                name="Lucky charm active"
                note="Your next box gives a piece you don’t have yet"
              />
            )}
            {charms.length > 0 && (
              <ItemRow
                icon={<Clover size={18} aria-hidden="true" />}
                name="Lucky charm"
                count={charms.length}
                note="Makes the next box an art piece you don’t have yet"
                action={
                  <button
                    type="button"
                    className="button"
                    disabled={!canEdit || Boolean(activeCharm)}
                    title={activeCharm ? 'A lucky charm is already active' : undefined}
                    onClick={() => useCharm.mutate(charms[0]!.id)}
                  >
                    Use
                  </button>
                }
              />
            )}
          </ul>
        </section>
      )}

      {rewards.length > 0 && (
        <section className="section">
          <h2 className="section__title">Real-life rewards</h2>
          <ul className="shop-list">
            {rewards.map((item) => (
              <ItemRow
                key={item.id}
                icon={<RewardIconView icon={item.payload?.icon as RewardIcon} size={18} />}
                name={String(item.payload?.name)}
                note={`Bought ${formatShortDate(dateInZone(new Date(item.createdAt), timeZone))}`}
                action={
                  <button
                    type="button"
                    className="button"
                    disabled={!canEdit}
                    onClick={() => useReward.mutate(item.id)}
                  >
                    Use
                  </button>
                }
              />
            ))}
          </ul>
        </section>
      )}

      <section className="section">
        <h2 className="section__title">History</h2>
        {inventory && <History entries={inventory.history} />}
      </section>

      <ArmDialog freeze={arming} onClose={() => setArming(null)} />
      <BoxOpenDialog
        boxId={openingBox}
        onClose={() => setOpeningBox(null)}
        onAnother={nextBox ? () => setOpeningBox(nextBox.id) : null}
      />
      <VacationDialog
        key={planning?.id ?? 'none'}
        item={planning}
        onClose={() => setPlanning(null)}
      />
    </>
  );
}
