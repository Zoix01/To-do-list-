import { Clover, Coins, Package, Palette, Snowflake, TreePalm } from 'lucide-react';
import { useEffect, useState } from 'react';
import { findCosmetic, type HabitIcon } from '../../../shared/cosmetics';
import type { RewardIcon } from '../../../shared/shop';
import { SEASONS } from '../../../shared/seasonData';
import { findPiece } from '../../../shared/seasons';
import type { BoxOpening } from '../../../shared/types';
import { Dialog } from '../../components/Dialog';
import { errorMessage } from '../../lib/api';
import { useFeedback } from '../../lib/feedback';
import { useOpenBox, useShopRewards } from '../../lib/queries';
import { HABIT_ICON_COMPONENTS } from '../../lib/habitIcons';
import { RewardIconView } from '../../lib/rewardIcons';
import { formatCoins } from '../../lib/rewards';
import { ArtPiece } from './ArtPiece';

/** The box shakes at least this long, even when the server answers sooner. */
const SHAKE_MS = 900;

const TIER_NAMES = { common: 'Common', rare: 'Rare', legendary: 'Legendary' } as const;

function Reveal({ opening }: { opening: BoxOpening }) {
  const { data: shopRewards } = useShopRewards();
  const piece = opening.pieceId ? findPiece(SEASONS, opening.pieceId) : null;
  const artwork = piece
    ? SEASONS.find((s) => s.id === piece.seasonId)?.artworks.find((a) => a.id === piece.artworkId)
    : undefined;
  let visual;
  let title: string;
  let note: string | null = null;
  switch (opening.type) {
    case 'piece':
      visual = artwork && piece && (
        <ArtPiece artwork={artwork} index={piece.index} className="box-reveal__piece" />
      );
      title = `${TIER_NAMES[opening.tier ?? 'common']} piece`;
      note = opening.duplicate
        ? `You have it already: +${opening.shards} shards`
        : `${artwork?.title ?? ''} · ${artwork?.artist ?? ''}`;
      break;
    case 'pouch':
      visual = <Coins size={40} aria-hidden="true" />;
      title = 'Coin pouch';
      note = `+${formatCoins(opening.coins)} coins`;
      break;
    case 'charm':
      visual = <Clover size={40} aria-hidden="true" />;
      title = 'Lucky charm';
      note = 'Use it to make your next box a piece you don’t have';
      break;
    case 'freeze':
      visual = <Snowflake size={40} aria-hidden="true" />;
      title = 'Streak freeze';
      break;
    case 'vacation':
      visual = <TreePalm size={40} aria-hidden="true" />;
      title = 'Vacation day';
      break;
    case 'reward': {
      const icon = shopRewards?.find((r) => r.id === opening.rewardId)?.icon ?? 'gift';
      visual = <RewardIconView icon={icon as RewardIcon} size={40} />;
      title = opening.rewardName ?? 'Real-life reward';
      note = 'A real-life reward, in your Inventory';
      break;
    }
    case 'cosmetic': {
      const cosmetic = opening.cosmeticId ? findCosmetic(opening.cosmeticId) : undefined;
      const Icon =
        cosmetic?.kind === 'icon' ? HABIT_ICON_COMPONENTS[cosmetic.value as HabitIcon] : null;
      visual =
        cosmetic?.kind === 'color' ? (
          <span
            className="cosmetic-swatch cosmetic-swatch--large"
            style={{ background: cosmetic.value }}
          />
        ) : Icon ? (
          <Icon size={40} aria-hidden="true" />
        ) : (
          <Palette size={40} aria-hidden="true" />
        );
      title = cosmetic?.name ?? 'Cosmetic';
      note = 'Unlocked for good';
      break;
    }
  }
  const tier = opening.type === 'piece' ? (opening.tier ?? 'common') : 'item';
  return (
    <div className={`box-reveal box-reveal--${tier}`}>
      <div className="box-reveal__visual">{visual}</div>
      <p className="box-reveal__title">{title}</p>
      {note && <p className="muted box-reveal__note">{note}</p>}
      {opening.charmUsed && <p className="muted box-reveal__note">Lucky charm used</p>}
    </div>
  );
}

/**
 * Opening a box (SPEC §13.7, §13.11): the box shakes while the server decides
 * and stores the result, then opens and the item flips in, colored by rarity.
 */
export function BoxOpenDialog({
  boxId,
  onClose,
  onAnother,
}: {
  boxId: string | null;
  onClose: () => void;
  /** Opens the next box, if there is one. */
  onAnother: (() => void) | null;
}) {
  const open = useOpenBox();
  const { showError } = useFeedback();
  const [opening, setOpening] = useState<BoxOpening | null>(null);

  useEffect(() => {
    if (!boxId) return;
    let cancelled = false;
    setOpening(null);
    const started = Date.now();
    open.mutate(boxId, {
      onSuccess: (result) => {
        const wait = Math.max(0, SHAKE_MS - (Date.now() - started));
        window.setTimeout(() => !cancelled && setOpening(result), wait);
      },
      onError: (error) => {
        showError(errorMessage(error));
        onClose();
      },
    });
    return () => {
      cancelled = true;
    };
    // Each box id is opened once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxId]);

  return (
    <Dialog open={boxId !== null} onClose={onClose} title="Mystery box" hideTitle>
      <div className="box-open" aria-live="polite">
        {opening ? (
          <Reveal opening={opening} />
        ) : (
          <div className="box-open__box">
            <Package size={56} aria-hidden="true" />
            <span className="visually-hidden">Opening…</span>
          </div>
        )}
      </div>
      <div className="dialog__actions">
        {opening && onAnother && (
          <button type="button" className="button" onClick={onAnother}>
            Open another
          </button>
        )}
        <button
          type="button"
          className="button button--primary"
          disabled={!opening}
          onClick={onClose}
        >
          Done
        </button>
      </div>
    </Dialog>
  );
}
