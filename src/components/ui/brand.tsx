import React from 'react';

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

/** QAS Official Logo: 3D Emblem Icon + Wordmark */
export const QasLogo: React.FC<{ size?: 'sm' | 'md' | 'lg'; className?: string; hideIcon?: boolean }> = ({
  size = 'md',
  className,
  hideIcon = false,
}) => {
  const iconDim = size === 'sm' ? 'w-7 h-7 rounded-lg' : size === 'lg' ? 'w-11 h-11 rounded-xl' : 'w-8 h-8 rounded-xl';

  return (
    <div className={cx('flex items-center gap-2 select-none', className)}>
      {!hideIcon && (
        <img
          src="/icons/icon-192.png"
          alt="Icon Audit QAS"
          className={cx(
            iconDim,
            'object-contain shadow-xs border border-slate-200/80 flex-shrink-0 bg-white'
          )}
        />
      )}
      <div className="flex flex-col leading-none">
        <div className="flex items-baseline">
          <span className={cx('font-extrabold text-brand-red tracking-tight', size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-2xl' : 'text-xl')}>
            Q
          </span>
          <span className={cx('font-extrabold text-brand-ink tracking-tight', size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-2xl' : 'text-xl')}>
            AS
          </span>
          <span className="sr-only">Audit QAS</span>
        </div>
        <span className={cx('font-medium text-slate-500 italic mt-0.5', size === 'sm' ? 'text-[7.5px]' : size === 'lg' ? 'text-[10px]' : 'text-[8.5px]')}>
          Quality Assurance System
          <span className="sr-only">Motorcycle Logistic</span>
        </span>
      </div>
    </div>
  );
};

/** Promotional banner with the 3D audit illustration and red-silver corner blades. */
export const QasBanner: React.FC<{ className?: string; compact?: boolean }> = ({ className, compact }) => (
  <div
    className={cx(
      'relative overflow-hidden rounded-2xl border border-brand-line bg-gradient-to-br from-white via-slate-50 to-slate-100 shadow-card',
      className
    )}
  >
    <svg viewBox="0 0 240 140" className="absolute top-0 right-0 w-40 h-auto pointer-events-none" aria-hidden="true">
      <polygon points="90,0 240,0 240,120 130,0" fill="#E2E8F0" />
      <polygon points="140,0 240,0 240,80 175,0" fill="#E11D2E" />
      <polygon points="180,0 240,0 240,45" fill="#B91C1C" />
    </svg>
    <img
      src="/images/qas-audit-3d.png"
      alt=""
      aria-hidden="true"
      className={cx(
        'absolute pointer-events-none select-none object-contain drop-shadow-md',
        compact ? 'right-2 top-2 w-[52%] max-h-[70%]' : 'right-3 top-6 w-[62%] max-h-[58%]'
      )}
    />
    <div className={cx('relative h-full flex flex-col justify-end', compact ? 'p-3' : 'p-4 sm:p-5')}>
      <span className={cx('font-extrabold text-brand-ink tracking-tight leading-none', compact ? 'text-xl' : 'text-3xl')}>QAS</span>
      <span className={cx('font-semibold text-slate-700 mt-1', compact ? 'text-[10px]' : 'text-sm')}>Quality Assurance System</span>
      <span className={cx('text-slate-500 leading-snug mt-1.5', compact ? 'text-[10px]' : 'text-xs')}>
        Kualitas proses hari ini,
        <br />
        untuk hasil yang lebih baik esok.
      </span>
    </div>
  </div>
);
