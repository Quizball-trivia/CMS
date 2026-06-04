'use client';

import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface QuestionImagePreviewProps {
  src: string;
  alt: string;
  sourceUrl?: string | null;
  className?: string;
  compact?: boolean;
}

const loadedImageUrls = new Set<string>();
const preloadingImageUrls = new Map<string, Promise<void>>();

export function preloadQuestionImage(src: string | null | undefined): Promise<void> {
  if (!src || loadedImageUrls.has(src)) return Promise.resolve();
  const existing = preloadingImageUrls.get(src);
  if (existing) return existing;
  if (typeof window === 'undefined') return Promise.resolve();

  const preload = new Promise<void>((resolve) => {
    const image = new window.Image();
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    image.onload = () => {
      loadedImageUrls.add(src);
      preloadingImageUrls.delete(src);
      resolve();
    };
    image.onerror = () => {
      preloadingImageUrls.delete(src);
      resolve();
    };
    image.src = src;
  });

  preloadingImageUrls.set(src, preload);
  return preload;
}

export function QuestionImagePreview({
  src,
  alt,
  sourceUrl,
  className,
  compact = false,
}: QuestionImagePreviewProps) {
  return (
    <QuestionImagePreviewFrame
      key={src}
      src={src}
      alt={alt}
      sourceUrl={sourceUrl}
      className={className}
      compact={compact}
    />
  );
}

function QuestionImagePreviewFrame({
  src,
  alt,
  sourceUrl,
  className,
  compact = false,
}: QuestionImagePreviewProps) {
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>(
    loadedImageUrls.has(src) ? 'loaded' : 'loading'
  );

  return (
    <div className={cn('min-w-0', className)}>
      <div
        className={cn(
          'relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-950/5',
          compact ? 'max-h-72 min-h-48' : 'max-h-96 min-h-56'
        )}
      >
        {state === 'loading' && (
          <div className="absolute inset-0 animate-pulse bg-[linear-gradient(110deg,#f1f5f9_8%,#e2e8f0_18%,#f1f5f9_33%)] bg-[length:200%_100%]" />
        )}
        {state === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-50 px-4 text-center text-sm text-slate-500">
            <ImageOff className="h-6 w-6" />
            <span>Image URL did not return a renderable image</span>
            <span className="max-w-sm text-xs text-slate-400">
              Use a direct JPG, PNG, WebP, or Wikimedia file URL.
            </span>
          </div>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          loading="eager"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => {
            loadedImageUrls.add(src);
            setState('loaded');
          }}
          onError={() => setState('error')}
          className={cn(
            'absolute inset-0 h-full w-full object-contain transition-opacity duration-200',
            state === 'loaded' ? 'opacity-100' : 'opacity-0'
          )}
        />
      </div>
      {(sourceUrl || src) && (
        <p className="mt-1 min-w-0 truncate text-xs text-muted-foreground" title={sourceUrl || src}>
          {sourceUrl || src}
        </p>
      )}
    </div>
  );
}
