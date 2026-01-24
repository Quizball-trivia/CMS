'use client';

import { Button } from '@/components/ui/button';
import { Users, TrendingUp, Trophy } from 'lucide-react';

interface CategoryPreviewProps {
  name: string | undefined;
  description: string | undefined;
  icon: string | undefined;
  imageUrl: string | undefined;
  activeLang: 'en' | 'ka';
  onLanguageChange: (lang: 'en' | 'ka') => void;
}

export function CategoryPreview({
  name,
  description,
  icon,
  imageUrl,
  activeLang,
  onLanguageChange,
}: CategoryPreviewProps) {
  return (
    <div className="relative group overflow-hidden rounded-[2rem] border border-white/10 min-h-[240px] w-full shadow-2xl">
      {/* Language Toggle */}
      <div className="absolute top-3 right-3 z-20 flex gap-1 bg-black/60 backdrop-blur-md p-1 rounded-lg border border-white/10">
        <Button
          type="button"
          size="sm"
          variant={activeLang === 'en' ? 'default' : 'ghost'}
          className="h-6 px-2 text-[10px]"
          onClick={() => onLanguageChange('en')}
        >
          EN
        </Button>
        <Button
          type="button"
          size="sm"
          variant={activeLang === 'ka' ? 'default' : 'ghost'}
          className="h-6 px-2 text-[10px]"
          onClick={() => onLanguageChange('ka')}
        >
          KA
        </Button>
      </div>

      {/* Background Layer */}
      <div className="absolute inset-0 bg-[#0a0a0a]">
        {imageUrl ? (
          <>
            <img
              src={imageUrl}
              alt=""
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-transparent" />
          </>
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-primary/20 via-primary/5 to-black" />
        )}
      </div>

      {/* Content Layer */}
      <div className="relative h-full w-full p-6 flex flex-col justify-between">
        {/* Top Row */}
        <div className="flex items-start justify-between">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 shadow-xl">
            <span className="text-3xl leading-none">{icon || '✨'}</span>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2 bg-[#22c55e] text-white px-3 py-1.5 rounded-lg shadow-lg">
              <Trophy className="w-4 h-4" />
              <span className="text-xs font-black tracking-tighter">#52</span>
            </div>
          </div>
        </div>

        {/* Bottom Row */}
        <div className="flex items-end justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-2xl font-black tracking-tight text-white truncate drop-shadow-md">
              {name || 'New Category'}
            </h3>
            <p className="mt-1 text-sm text-white/70 line-clamp-2 font-medium max-w-[80%] whitespace-normal leading-relaxed">
              {description ||
                'Experience the ultimate challenge in this category.'}
            </p>

            <div className="mt-4 flex items-center gap-3">
              <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-full shadow-lg transition-transform hover:scale-105">
                <Users className="w-3.5 h-3.5 text-white/60" />
                <span className="text-xs font-bold text-white tracking-tight">
                  24.8k
                </span>
              </div>
              <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-full shadow-lg transition-transform hover:scale-105">
                <TrendingUp className="w-3.5 h-3.5 text-white/60" />
                <span className="text-xs font-bold text-white tracking-tight">
                  2450
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
