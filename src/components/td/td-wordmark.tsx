import { cn } from '@/lib/utils';

/** Text wordmark until Betsson supplies logo files for the CMS. */
export function TdWordmark({ className, size = 'md' }: { className?: string; size?: 'md' | 'lg' }) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span
        aria-hidden
        className={cn(
          'grid place-items-center rounded-lg bg-primary font-black text-primary-foreground',
          size === 'lg' ? 'size-12 text-lg' : 'size-9 text-sm',
        )}
      >
        TD
      </span>
      <span className="flex flex-col leading-none">
        <span className={cn('font-extrabold uppercase tracking-wide text-foreground', size === 'lg' ? 'text-xl' : 'text-sm')}>
          Table Derby
        </span>
        <span className={cn('mt-1 font-medium text-(--td-text-3)', size === 'lg' ? 'text-sm' : 'text-[11px]')}>
          Betsson content studio
        </span>
      </span>
    </div>
  );
}
