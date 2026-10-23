'use client';

import { ImageIcon } from 'lucide-react';
import { useTdAllRows, useTdUploadUrl } from '@/hooks/use-td-content';
import type { TdContentData } from '@/lib/td/admin-api';
import { releasedImage } from '@/components/td/media/td-media';
import { cn } from '@/lib/utils';

/** The SoFIFA face of a card, through the CMS's own route (app/td/face). */
export const cardFaceSrc = (photo: { id: number; ver: string }) => `/td/face?id=${photo.id}&v=${encodeURIComponent(photo.ver)}`;

/** A spot that is still loading: visibly so, not an empty frame. */
function Loading({ className }: { className: string }) {
  return (
    <span className={cn(className, 'flex animate-pulse items-center justify-center bg-slate-200 text-slate-400')}>
      <ImageIcon className="h-6 w-6" />
    </span>
  );
}

function Uploaded({ uploadId, alt, className }: { uploadId: string; alt: string; className: string }) {
  // A card's picture is never shown wider than a tile: the small copy, not the file as sent.
  const file = useTdUploadUrl(uploadId, { preview: true });
  return file.url ? (
    // eslint-disable-next-line @next/next/no-img-element -- an object URL of an authenticated download
    <img src={file.url} alt={alt} className={className} />
  ) : (
    <Loading className={className} />
  );
}

/** A card's picture as the game shows it: its uploaded photo, otherwise its SoFIFA face, otherwise a blank. */
export function TdCardImage({ card, className }: { card: Pick<TdContentData<'cards'>, 'display' | 'imageKey' | 'photo'>; className?: string }) {
  const media = useTdAllRows('media', {}, Boolean(card.imageKey));
  const frame = cn('h-full w-full object-cover', className);
  if (card.imageKey) {
    const found = media.data?.rows.find((row) => row.data.key === card.imageKey);
    const uploadId = found ? releasedImage(found).uploadId : null;
    if (uploadId) return <Uploaded uploadId={uploadId} alt={card.display} className={frame} />;
    if (media.isLoading) return <Loading className={frame} />;
  }
  if (card.photo)
    // eslint-disable-next-line @next/next/no-img-element -- served by the CMS's own face route
    return <img src={cardFaceSrc(card.photo)} alt={card.display} loading="lazy" className={frame} />;
  return (
    <span className={cn(frame, 'flex items-center justify-center bg-slate-100 text-slate-300')}>
      <ImageIcon className="h-6 w-6" />
    </span>
  );
}
