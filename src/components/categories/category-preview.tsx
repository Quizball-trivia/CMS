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
    <div className="relative group overflow-hidden rounded-[1.5rem] border border-white/10 min-h-[160px] w-full shadow-xl">
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
          </>
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-primary/20 via-primary/5 to-black" />
        )}
      </div>

      {/* Content Layer */}
      <div className="relative h-full w-full p-4 flex flex-col justify-between">
        {/* Top Row */}
        <div className="flex items-start justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-black/40 backdrop-blur-md border border-white/10 shadow-xl">
            <span className="text-xl leading-none">{icon || '✨'}</span>
          </div>

          <div className="flex items-center gap-1.5 bg-[#22c55e] text-white px-2 py-1 rounded-lg shadow-lg">
            <Trophy className="w-3 h-3" />
            <span className="text-[10px] font-black tracking-tighter">#52</span>
          </div>
        </div>

        {/* Bottom Row */}
        <div className="flex items-end justify-between gap-2 mt-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-black tracking-tight text-white truncate drop-shadow-md">
              {name || 'New Category'}
            </h3>
            <p className="mt-0.5 text-[11px] text-white/70 line-clamp-1 font-medium max-w-[90%] whitespace-normal leading-relaxed">
              {description ||
                'Experience the ultimate challenge in this category.'}
            </p>

            <div className="mt-2 flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-md border border-white/10 px-2 py-1 rounded-full shadow-lg transition-transform hover:scale-105">
                <Users className="w-3 h-3 text-white/60" />
                <span className="text-[10px] font-bold text-white tracking-tight">
                  24.8k
                </span>
              </div>
              <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-md border border-white/10 px-2 py-1 rounded-full shadow-lg transition-transform hover:scale-105">
                <TrendingUp className="w-3 h-3 text-white/60" />
                <span className="text-[10px] font-bold text-white tracking-tight">
                  2450
                </span>
              </div>
            </div>
          </div>

          {/* Language Toggle - Bottom Right */}
          <div className="flex gap-0.5 bg-black/60 backdrop-blur-md p-0.5 rounded-lg border border-white/10 self-end">
            <Button
              type="button"
              size="sm"
              variant={activeLang === 'en' ? 'default' : 'ghost'}
              className="h-5 px-1.5 text-[9px]"
              onClick={() => onLanguageChange('en')}
            >
              EN
            </Button>
            <Button
              type="button"
              size="sm"
              variant={activeLang === 'ka' ? 'default' : 'ghost'}
              className="h-5 px-1.5 text-[9px]"
              onClick={() => onLanguageChange('ka')}
            >
              KA
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
