import type { CSSProperties } from 'react';
import type { Artwork } from '../../../shared/seasons';

/**
 * One piece of an artwork, cut from the single image with CSS background
 * position (SPEC §13.13): no pre-cut files.
 */
export function ArtPiece({
  artwork,
  index,
  className,
}: {
  artwork: Artwork;
  index: number;
  className?: string;
}) {
  const col = index % artwork.cols;
  const row = Math.floor(index / artwork.cols);
  const style: CSSProperties = {
    backgroundImage: `url(${artwork.image})`,
    backgroundSize: `${artwork.cols * 100}% ${artwork.rows * 100}%`,
    backgroundPosition: `${(col / (artwork.cols - 1)) * 100}% ${(row / (artwork.rows - 1)) * 100}%`,
    aspectRatio: `${artwork.width / artwork.cols} / ${artwork.height / artwork.rows}`,
  };
  return <span className={['art-piece', className].filter(Boolean).join(' ')} style={style} />;
}
