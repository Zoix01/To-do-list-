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

function ArtworkGrid({
  artwork,
  pieces,
  owned,
  current,
  onOpen,
}: {
  artwork: Artwork;
  pieces: Piece[];
  owned: Map<string, OwnedPiece>;
  current: Season | null;
  onOpen: () => void;
}) {
  const { canEdit } = useApp();
  const { data: rewards } = useRewards();
  const { buyPiece } = useInventoryMutations();
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
            <span
              key={piece.id}
              className={`art-missing art-missing--${piece.tier}`}
              style={{
                aspectRatio: `${artwork.width / artwork.cols} / ${artwork.height / artwork.rows}`,
              }}
            >
              <span className="art-missing__tier">{TIER_NAMES[piece.tier]}</span>
              <button
                type="button"
                className="art-missing__buy"
                disabled={!canEdit || !affordable}
                title={affordable ? undefined : 'Not enough shards'}
                onClick={() => buyPiece.mutate(piece.id)}
              >
                Buy · <Gem size={11} aria-hidden="true" /> {price}
              </button>
            </span>
          );
        })}
      </div>
      <figcaption className="artwork__caption">
        {complete ? artwork.title : `${pieces.filter((p) => owned.has(p.id)).length}/6`}
      </figcaption>
    </figure>
  );
}

function SeasonSection({
  season,
  owned,
  current,
  onOpen,
}: {
  season: Season;
  owned: Map<string, OwnedPiece>;
  current: Season | null;
  onOpen: (artwork: Artwork) => void;
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
  const all = rewards ? seasonsFrom(rewards.start) : SEASONS;
  const { data: ownedList } = useGallery();
  const [viewing, setViewing] = useState<Artwork | null>(null);
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
      {seasons.map((season) => (
        <SeasonSection
          key={season.id}
          season={season}
          owned={owned}
          current={current}
          onOpen={setViewing}
        />
      ))}

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
