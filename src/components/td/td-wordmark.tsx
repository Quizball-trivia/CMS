import Image from 'next/image';
import { cn } from '@/lib/utils';
// Bundled, not under /public: the workspace guard serves nothing outside /td.
import betssonSport from './betsson-sport.png';

/** Betsson's logo (their supplied artwork) beside the product's name. */
export function TdWordmark({ className, size = 'md' }: { className?: string; size?: 'md' | 'lg' }) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <Image
        src={betssonSport}
        alt="Betsson Sport"
        width={411}
        height={144}
        priority={size === 'lg'}
        className={cn('w-auto shrink-0', size === 'lg' ? 'h-12' : 'h-9')}
      />
      <span aria-hidden className={cn('w-px shrink-0 bg-border', size === 'lg' ? 'h-10' : 'h-8')} />
      <span className="flex flex-col leading-none">
        <span className={cn('font-extrabold uppercase tracking-wide text-foreground', size === 'lg' ? 'text-xl' : 'text-sm')}>
          Table Derby
        </span>
        <span className={cn('mt-1 font-medium text-(--td-text-3)', size === 'lg' ? 'text-sm' : 'text-[11px]')}>
          Content studio
        </span>
      </span>
    </div>
  );
}
