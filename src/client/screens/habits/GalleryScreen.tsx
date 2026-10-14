import { Gem } from 'lucide-react';
import { useState } from 'react';
import { dateInZone, formatShortDate } from '../../../shared/dates';
import { SEASONS, seasonsFrom } from '../../../shared/seasonData';
import {
  currentSeason,
  daysLeft,
  piecePrice,
  piecesOf,
  startedSeasons,
  type Artwork,
  type Piece,
  type Season,
} from '../../../shared/seasons';
import type { OwnedPiece } from '../../../shared/types';
import { ScreenHeader } from '../../components/AppShell';
import { Dialog } from '../../components/Dialog';
import { useApp } from '../../lib/appContext';
import { useGallery, useInventoryMutations, useRewards } from '../../lib/queries';
import { ArtPiece } from './ArtPiece';
import { HabitsNav } from './HabitsNav';
import './habits.css';

const TIER_NAMES = { common: 'Common', rare: 'Rare', legendary: 'Legendary' } as const;

interface PieceToBuy {
  artwork: Artwork;
  pieces: Piece[];
  piece: Piece;
  price: number;
}

/**
 * A piece not owned yet: a dark, blurred glimpse of it with its rarity and shard
 * price. Tapping it asks first (SPEC §13.8); without enough shards it's just shown.
 */
function MissingPiece({
  artwork,
  piece,
  price,
  onBuy,
}: {
  artwork: Artwork;
  piece: Piece;
  price: number;
  onBuy: (() => void) | null;
}) {
  const content = (
    <>
      <ArtPiece artwork={artwork} index={piece.index} className="art-missing__glimpse" />
      <span className="art-missing__label">
        <span className="art-missing__tier">{TIER_NAMES[piece.tier]}</span>
        <span className="art-missing__price mono-figures">
          <Gem size={11} aria-hidden="true" /> {price}
        </span>
      </span>
    </>
  );
  const className = `art-missing art-missing--${piece.tier}`;
  const style = {
    aspectRatio: `${artwork.width / artwork.cols} / ${artwork.height / artwork.rows}`,
  };
  return onBuy ? (
    <button
      type="button"
      className={className}
      style={style}
      aria-label={`Buy this ${piece.tier} piece for ${price} shards`}
      onClick={onBuy}
    >
      {content}
    </button>
  ) : (
    <span className={`${className} is-locked`} style={style} title="Not enough shards">
      {content}
    </span>
  );
}

function ArtworkGrid({
  artwork,
  pieces,
  owned,
  current,
  onOpen,
  onBuy,
}: {
  artwork: Artwork;
  pieces: Piece[];
  owned: Map<string, OwnedPiece>;
  current: Season | null;
  onOpen: () => void;
  onBuy: (piece: PieceToBuy) => void;
}) {
  const { canEdit } = useApp();
  const { data: rewards } = useRewards();
  const complete = pieces.every((piece) => owned.has(piece.id));
  return (
    <figure
      className={[
        'artwork',
        artwork.height > artwork.width && 'artwork--portrait',
        complete && 'is-complete',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div
        className="artwork__grid"
        style={{ gridTemplateColumns: `repeat(${artwork.cols}, minmax(0, 1fr))` }}
      >
        {pieces.map((piece) => {
          if (owned.has(piece.id)) {
            return complete ? (
              <button
                key={piece.id}
                type="button"
                className="artwork__cell"
                aria-label={`Open “${artwork.title}”`}
                onClick={onOpen}
              >
                <ArtPiece artwork={artwork} index={piece.index} />
              </button>
            ) : (
              <ArtPiece key={piece.id} artwork={artwork} index={piece.index} />
            );
          }
          const price = piecePrice(piece, current);
          const affordable = (rewards?.shards ?? 0) >= price;
          return (
            <MissingPiece
              key={piece.id}
              artwork={artwork}
              piece={piece}
              price={price}
              onBuy={canEdit && affordable ? () => onBuy({ artwork, pieces, piece, price }) : null}
            />
          );
        })}
      </div>
      <figcaption className="artwork__caption">
        {complete ? artwork.title : `${pieces.filter((p) => owned.has(p.id)).length}/6`}
      </figcaption>
    </figure>
  );
}

/** Buying a piece with shards is confirmed first: a stray tap shouldn't spend them. */
function BuyPieceDialog({
  buying,
  owned,
  onClose,
}: {
  buying: PieceToBuy | null;
  owned: Map<string, OwnedPiece>;
  onClose: () => void;
}) {
  const { data: rewards } = useRewards();
  const { buyPiece } = useInventoryMutations();
  const shards = rewards?.shards ?? 0;
  return (
    <Dialog open={buying !== null} onClose={onClose} title="Buy this piece?">
      {buying && (
        <>
          <div
            className="artwork__grid buy-piece__preview"
            style={{ gridTemplateColumns: `repeat(${buying.artwork.cols}, minmax(0, 1fr))` }}
            aria-hidden="true"
          >
            {buying.pieces.map((piece) =>
              owned.has(piece.id) ? (
                <ArtPiece key={piece.id} artwork={buying.artwork} index={piece.index} />
              ) : (
                <ArtPiece
                  key={piece.id}
                  artwork={buying.artwork}
                  index={piece.index}
                  className={
                    piece.id === buying.piece.id
                      ? `buy-piece__target art-missing--${piece.tier}`
                      : 'buy-piece__missing'
                  }
                />
              ),
            )}
          </div>
          <p>
            A {buying.piece.tier} piece for{' '}
            <span className="mono-figures">
              <Gem size={13} aria-hidden="true" /> {buying.price}
            </span>{' '}
            shards.
          </p>
          <p className="muted">
            You have <span className="mono-figures">{shards}</span>;{' '}
            <span className="mono-figures">{shards - buying.price}</span> left after.
          </p>
        </>
      )}
      <div className="dialog__actions">
        <button type="button" className="button" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="button button--primary"
          disabled={!buying || shards < buying.price}
          onClick={() => {
            if (buying) buyPiece.mutate(buying.piece.id);
            onClose();
          }}
        >
          Buy
        </button>
      </div>
    </Dialog>
  );
}

function SeasonSection({
  season,
  owned,
  current,
  onOpen,
  onBuy,
}: {
  season: Season;
  owned: Map<string, OwnedPiece>;
  current: Season | null;
  onOpen: (artwork: Artwork) => void;
  onBuy: (piece: PieceToBuy) => void;
}) {
  const { today } = useApp();
  const pieces = piecesOf(season);
  const have = pieces.filter((piece) => owned.has(piece.id)).length;
  const left = daysLeft(season, today);
  const isCurrent = season.id === current?.id;
  return (
    <section className="section gallery-season">
      <div className="gallery-season__header">
        <h2 className="gallery-season__name">{season.name}</h2>
        <span className="muted">
          {isCurrent && (left > 0 ? `${left} ${left === 1 ? 'day' : 'days'} left · ` : 'Ended · ')}
          <span className="mono-figures">
            {have}/{pieces.length}
          </span>{' '}
          pieces
        </span>
      </div>
      <div className="gallery-season__artworks">
        {season.artworks.map((artwork) => (
          <ArtworkGrid
            key={artwork.id}
            artwork={artwork}
            pieces={pieces.filter((piece) => piece.artworkId === artwork.id)}
            owned={owned}
            current={current}
            onOpen={() => onOpen(artwork)}
            onBuy={onBuy}
          />
        ))}
      </div>
    </section>
  );
}

/** Seasons' art collections: current at the top, past ones below (SPEC §13.10). */
export function GalleryScreen() {
  const { today, timeZone } = useApp();
  const { data: rewards } = useRewards();
  const all = rewards ? seasonsFrom(rewards.seasonStart) : SEASONS;
  const { data: ownedList } = useGallery();
  const [viewing, setViewing] = useState<Artwork | null>(null);
  const [buying, setBuying] = useState<PieceToBuy | null>(null);
  const owned = new Map((ownedList ?? []).map((piece) => [piece.pieceId, piece]));
  const current = currentSeason(all, today);
  const seasons = startedSeasons(all, today);
  // The completion date of an artwork: when its last piece arrived.
  const completedOn = viewing
    ? [...owned.values()]
        .filter((piece) => piece.pieceId.startsWith(`${viewing.id}-`))
        .map((piece) => piece.acquiredAt)
        .sort()
        .at(-1)
    : undefined;

  return (
    <>
      <ScreenHeader title="Habits" />
      <HabitsNav />
      {seasons.length === 0 && (
        <p className="empty">
          The first season starts on {formatShortDate(all[0]?.start ?? today)}.
        </p>
      )}
      <div className="gallery">
        {seasons.map((season) => (
          <SeasonSection
            key={season.id}
            season={season}
            owned={owned}
            current={current}
            onOpen={setViewing}
            onBuy={setBuying}
          />
        ))}
      </div>
      <BuyPieceDialog buying={buying} owned={owned} onClose={() => setBuying(null)} />

      <Dialog
        open={viewing !== null}
        onClose={() => setViewing(null)}
        title={viewing?.title ?? 'Artwork'}
        hideTitle
        variant="full"
      >
        {viewing && (
          <figure className="artwork-full">
            <img src={viewing.image} alt={viewing.title} className="artwork-full__image" />
            <figcaption>
              <strong>{viewing.title}</strong>
              <span className="muted">
                {viewing.artist}, {viewing.year}
              </span>
              {completedOn && (
                <span className="muted">
                  Completed {formatShortDate(dateInZone(new Date(completedOn), timeZone))}
                </span>
              )}
            </figcaption>
            <button type="button" className="button" onClick={() => setViewing(null)}>
              Close
            </button>
          </figure>
        )}
      </Dialog>
    </>
  );
}
