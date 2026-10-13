import { Coins, Gem } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { formatShortDate } from '../../../shared/dates';
import { useRewards } from '../../lib/queries';
import { formatCoins } from '../../lib/rewards';

/** Level with its XP bar, coins and shards, and this week's earnings (SPEC §13.10). */
export function RewardsHeader() {
  const { data } = useRewards();
  const previousLevel = useRef<number | null>(null);
  const [leveledUp, setLeveledUp] = useState(false);
  const level = data?.level;

  useEffect(() => {
    if (level === undefined) return;
    if (previousLevel.current !== null && level > previousLevel.current) setLeveledUp(true);
    previousLevel.current = level;
  }, [level]);

  if (!data) return null;
  if (!data.started) {
    return <p className="rewards-bar muted">Rewards start {formatShortDate(data.start)}</p>;
  }
  const progress = Math.min(100, (data.xpIntoLevel / data.xpForNext) * 100);
  return (
    <div className="rewards-bar">
      <span
        className={leveledUp ? 'rewards-bar__level is-leveling' : 'rewards-bar__level'}
        onAnimationEnd={() => setLeveledUp(false)}
      >
        Level {data.level}
      </span>
      <span
        className="xp-bar"
        role="progressbar"
        aria-label="XP to the next level"
        aria-valuemin={0}
        aria-valuemax={data.xpForNext}
        aria-valuenow={data.xpIntoLevel}
      >
        <span className="xp-bar__fill" style={{ width: `${progress}%` }} />
      </span>
      <span className="muted mono-figures">
        {formatCoins(data.xpIntoLevel)} / {formatCoins(data.xpForNext)} XP
      </span>
      <span className="rewards-bar__stat" aria-label={`${formatCoins(data.coins)} coins`}>
        <Coins size={14} aria-hidden="true" />
        <span className="mono-figures">{formatCoins(data.coins)}</span>
      </span>
      <span className="rewards-bar__stat" aria-label={`${formatCoins(data.shards)} shards`}>
        <Gem size={14} aria-hidden="true" />
        <span className="mono-figures">{formatCoins(data.shards)}</span>
      </span>
      <span className="rewards-bar__week muted">
        This week:{' '}
        <span className="mono-figures">
          {formatCoins(data.week.earned)} / {formatCoins(data.week.budget)}
        </span>
      </span>
    </div>
  );
}
