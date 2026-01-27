import * as React from 'react';
import { cn } from '@/lib/utils';

interface DifficultySignalProps {
  difficulty: 'easy' | 'medium' | 'hard';
  size?: 'sm' | 'md';
  className?: string;
}

export function DifficultySignal({ difficulty, size = 'md', className }: DifficultySignalProps) {
  const dots = difficulty === 'easy' ? 1 : difficulty === 'medium' ? 2 : 3;
  const color = difficulty === 'easy'
    ? 'bg-emerald-500'
    : difficulty === 'medium'
    ? 'bg-amber-500'
    : 'bg-rose-500';

  const dotSize = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2';
  const gapSize = size === 'sm' ? 'gap-0.5' : 'gap-1';
  const inactiveColor = size === 'sm' ? 'bg-gray-200' : 'bg-slate-200';

  return (
    <div className={cn("flex items-center", gapSize, className)}>
      {[1, 2, 3].map((dot) => (
        <div
          key={dot}
          className={cn(
            dotSize,
            "rounded-full transition-all duration-300",
            dot <= dots ? color : inactiveColor
          )}
        />
      ))}
    </div>
  );
}

export function getDifficultyVariant(difficulty: string): string {
  switch (difficulty) {
    case 'easy':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'medium':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'hard':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    default:
      return 'bg-gray-50 text-gray-700 border-gray-200';
  }
}

export function getDifficultyTextColor(difficulty: string): string {
  switch (difficulty) {
    case 'easy':
      return 'text-emerald-500';
    case 'medium':
      return 'text-amber-500';
    case 'hard':
      return 'text-rose-500';
    default:
      return 'text-muted-foreground';
  }
}
