import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowLeft, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Tone, TONE_BADGE, TONE_HEX, TONE_TILE, auditStatusMeta, initials } from './tokens';

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

/* ------------------------------------------------------------------ Card */
export const Card: React.FC<{
  title?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children?: React.ReactNode;
}> = ({ title, action, className, bodyClassName, children }) => (
  <section className={cx('bg-white rounded-2xl border border-brand-line shadow-card flex flex-col min-h-0', className)}>
    {(title || action) && (
      <header className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-2 flex-shrink-0">
        {typeof title === 'string' ? (
          <h3 className="text-sm font-bold text-brand-ink tracking-tight">{title}</h3>
        ) : (
          title
        )}
        {action}
      </header>
    )}
    <div className={cx('px-4 pb-4 flex-1 min-h-0', !title && !action && 'pt-4', bodyClassName)}>{children}</div>
  </section>
);

/* -------------------------------------------------------------- IconTile */
export const IconTile: React.FC<{ icon: LucideIcon; tone?: Tone; size?: 'sm' | 'md' | 'lg'; round?: boolean; className?: string }> = ({
  icon: Icon,
  tone = 'blue',
  size = 'md',
  round = false,
  className,
}) => {
  const box = size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-12 h-12' : 'w-10 h-10';
  const ic = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-6 h-6' : 'w-5 h-5';
  return (
    <span className={cx('inline-flex items-center justify-center flex-shrink-0', round ? 'rounded-full' : 'rounded-xl', box, TONE_TILE[tone], className)}>
      <Icon className={ic} strokeWidth={2} />
    </span>
  );
};

/* -------------------------------------------------------------- StatCard */
export const StatCard: React.FC<{
  icon: LucideIcon;
  tone: Tone;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
}> = ({ icon, tone, label, value, hint, className }) => (
  <div className={cx('bg-white rounded-2xl border border-brand-line shadow-card p-3 sm:p-4 flex flex-col gap-1.5 min-w-0', className)}>
    <div className="flex items-center gap-2.5 min-w-0">
      <IconTile icon={icon} tone={tone} size="sm" round />
      <span className="text-[11px] sm:text-xs font-semibold text-slate-600 leading-tight truncate">{label}</span>
    </div>
    <div className="text-2xl sm:text-[28px] font-extrabold text-brand-ink leading-none tracking-tight">{value}</div>
    {hint && <div className="text-[10px] sm:text-[11px] text-brand-muted leading-tight truncate">{hint}</div>}
  </div>
);

/* ------------------------------------------------------------ StatusBadge */
export const StatusBadge: React.FC<{ status?: string | null; label?: string; tone?: Tone; solid?: boolean; className?: string }> = ({
  status,
  label,
  tone,
  solid,
  className,
}) => {
  const meta = auditStatusMeta(status);
  const t = tone || meta.tone;
  const text = label || meta.label;
  return (
    <span
      className={cx(
        'inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold border whitespace-nowrap leading-5',
        solid ? 'text-white border-transparent' : TONE_BADGE[t],
        className
      )}
      style={solid ? { backgroundColor: TONE_HEX[t] } : undefined}
    >
      {text}
    </span>
  );
};

/* ------------------------------------------------------------- DonutChart */
export interface DonutSegment {
  value: number;
  tone: Tone;
}
export const DonutChart: React.FC<{
  value?: number; // 0..100, used when segments not provided
  segments?: DonutSegment[];
  size?: number;
  stroke?: number;
  tone?: Tone;
  label?: React.ReactNode;
  sublabel?: React.ReactNode;
}> = ({ value = 0, segments, size = 120, stroke = 14, tone = 'green', label, sublabel }) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const segs: DonutSegment[] = segments && segments.length > 0 ? segments : [{ value: Math.max(0, Math.min(100, value)), tone }];
  const total = segments && segments.length > 0 ? segs.reduce((a, s) => a + s.value, 0) || 1 : 100;
  let offset = 0;
  return (
    <div className="relative inline-flex items-center justify-center flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#EEF1F5" strokeWidth={stroke} />
        {segs.map((s, i) => {
          const len = (s.value / total) * c;
          const el = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={TONE_HEX[s.tone]}
              strokeWidth={stroke}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              strokeLinecap={segs.length === 1 ? 'round' : 'butt'}
              style={{ transition: 'stroke-dasharray 600ms ease' }}
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {label !== undefined && <span className="text-lg sm:text-xl font-extrabold text-brand-ink leading-none">{label}</span>}
        {sublabel && <span className="text-[10px] text-brand-muted mt-0.5">{sublabel}</span>}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------- Tabs */
export interface TabItem {
  key: string;
  label: string;
  disabled?: boolean;
}
export const Tabs: React.FC<{
  tabs: TabItem[];
  active: string;
  onChange: (key: string) => void;
  variant?: 'pill' | 'underline';
  className?: string;
}> = ({ tabs, active, onChange, variant = 'pill', className }) => {
  if (variant === 'underline') {
    return (
      <div className={cx('flex items-center gap-4 sm:gap-6 border-b border-brand-line overflow-x-auto qas-scroll', className)} role="tablist">
        {tabs.map((t) => {
          const on = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={on}
              disabled={t.disabled}
              onClick={() => onChange(t.key)}
              className={cx(
                'relative py-2.5 text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors min-h-[40px] disabled:opacity-40',
                on ? 'text-brand-red' : 'text-slate-500 hover:text-brand-ink'
              )}
            >
              {t.label}
              {on && <span className="absolute left-0 right-0 -bottom-px h-0.5 rounded-full bg-brand-red" />}
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div className={cx('flex items-center gap-1.5 sm:gap-2 overflow-x-auto qas-scroll', className)} role="tablist">
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={on}
            disabled={t.disabled}
            onClick={() => onChange(t.key)}
            className={cx(
              'px-3.5 sm:px-4 min-h-[34px] rounded-full text-[11px] sm:text-xs font-semibold whitespace-nowrap border transition-all disabled:opacity-40',
              on ? 'bg-brand-red text-white border-brand-red shadow-sm' : 'bg-white text-slate-600 border-brand-line hover:border-slate-300'
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
};

/* ------------------------------------------------------------- PageHeader */
export const PageHeader: React.FC<{
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  back?: string | true;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}> = ({ title, subtitle, back, badge, actions, className }) => {
  const navigate = useNavigate();
  return (
    <div className={cx('flex items-start justify-between gap-3 flex-shrink-0', className)}>
      <div className="flex items-start gap-2 min-w-0">
        {back && (
          <button
            type="button"
            aria-label="Kembali"
            onClick={() => (back === true ? navigate(-1) : navigate(back))}
            className="w-9 h-9 -ml-1.5 inline-flex items-center justify-center rounded-xl text-brand-ink hover:bg-slate-100 flex-shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg sm:text-xl font-extrabold text-brand-ink tracking-tight leading-tight truncate">{title}</h1>
            {badge}
          </div>
          {subtitle && <p className="text-[11px] sm:text-xs text-brand-muted mt-0.5 leading-snug">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );
};

/* ------------------------------------------------------------- Pagination */
export const Pagination: React.FC<{ page: number; totalPages: number; onChange: (p: number) => void; className?: string }> = ({
  page,
  totalPages,
  onChange,
  className,
}) => {
  const pages = Array.from({ length: Math.max(1, totalPages) }, (_, i) => i);
  const visible = pages.length <= 5 ? pages : pages.filter((p) => p === 0 || p === pages.length - 1 || Math.abs(p - page) <= 1);
  return (
    <div className={cx('flex items-center gap-1', className)}>
      <button
        type="button"
        aria-label="Halaman sebelumnya"
        disabled={page <= 0}
        onClick={() => onChange(page - 1)}
        className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-brand-line text-slate-500 disabled:opacity-40 hover:bg-slate-50"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      {visible.map((p, i) => (
        <React.Fragment key={p}>
          {i > 0 && p - visible[i - 1] > 1 && <span className="px-1 text-xs text-slate-400">…</span>}
          <button
            type="button"
            onClick={() => onChange(p)}
            className={cx(
              'w-8 h-8 inline-flex items-center justify-center rounded-lg text-xs font-semibold',
              p === page ? 'bg-brand-red text-white' : 'text-slate-600 hover:bg-slate-100'
            )}
          >
            {p + 1}
          </button>
        </React.Fragment>
      ))}
      <button
        type="button"
        aria-label="Halaman berikutnya"
        disabled={page >= totalPages - 1}
        onClick={() => onChange(page + 1)}
        className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-brand-line text-slate-500 disabled:opacity-40 hover:bg-slate-50"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
};

/* ---------------------------------------------------------------- Stepper */
export const Stepper: React.FC<{ steps: string[]; current: number; onStepClick?: (i: number) => void; className?: string }> = ({
  steps,
  current,
  onStepClick,
  className,
}) => (
  <ol className={cx('flex items-start', className)}>
    {steps.map((s, i) => {
      const done = i < current;
      const on = i === current;
      return (
        <li key={s} className="flex-1 flex flex-col items-center relative min-w-0">
          {i > 0 && (
            <span className={cx('absolute top-4 right-1/2 w-full h-0.5 -z-0', i <= current ? 'bg-brand-green' : 'bg-slate-200')} />
          )}
          <button
            type="button"
            disabled={!onStepClick}
            onClick={() => onStepClick?.(i)}
            className={cx(
              'relative z-10 w-8 h-8 rounded-full inline-flex items-center justify-center text-xs font-bold border-2 transition-colors',
              done && 'bg-brand-green border-brand-green text-white',
              on && 'bg-brand-green border-brand-green text-white ring-4 ring-green-100',
              !done && !on && 'bg-white border-slate-200 text-slate-400'
            )}
          >
            {done ? <Check className="w-4 h-4" /> : i + 1}
          </button>
          <span className={cx('mt-1.5 text-[10px] sm:text-[11px] text-center leading-tight px-1', on ? 'font-bold text-brand-ink' : 'text-slate-500')}>
            {s}
          </span>
        </li>
      );
    })}
  </ol>
);

/* ----------------------------------------------------------------- Avatar */
export const Avatar: React.FC<{ name: string; size?: 'sm' | 'md' | 'lg'; className?: string }> = ({ name, size = 'md', className }) => {
  const box = size === 'sm' ? 'w-8 h-8 text-[11px]' : size === 'lg' ? 'w-14 h-14 text-lg' : 'w-9 h-9 text-xs';
  return (
    <span className={cx('inline-flex items-center justify-center rounded-full bg-brand-red text-white font-bold flex-shrink-0', box, className)}>
      {initials(name)}
    </span>
  );
};

/* ------------------------------------------------------------- Buttons */
type BtnVariant = 'primary' | 'navy' | 'outline' | 'ghost' | 'danger-outline';
const BTN: Record<BtnVariant, string> = {
  primary: 'bg-brand-red text-white hover:bg-brand-redDark shadow-sm shadow-red-600/20',
  navy: 'bg-brand-blue text-white hover:bg-blue-700 shadow-sm shadow-blue-600/20',
  outline: 'bg-white text-brand-ink border border-brand-line hover:bg-slate-50',
  ghost: 'text-slate-600 hover:bg-slate-100',
  'danger-outline': 'bg-white text-brand-red border border-red-200 hover:bg-brand-redSoft',
};
export const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' | 'lg'; icon?: LucideIcon; iconRight?: LucideIcon }
> = ({ variant = 'primary', size = 'md', icon: Icon, iconRight: IconRight, className, children, ...rest }) => {
  const sz = size === 'sm' ? 'min-h-[32px] px-3 text-[11px]' : size === 'lg' ? 'min-h-[48px] px-5 text-sm' : 'min-h-[40px] px-4 text-xs';
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed',
        sz,
        BTN[variant],
        className
      )}
    >
      {Icon && <Icon className="w-4 h-4" />}
      {children}
      {IconRight && <IconRight className="w-4 h-4" />}
    </button>
  );
};

/* ------------------------------------------------------- Misc helpers */
export const ComingSoon: React.FC<{ className?: string }> = ({ className }) => (
  <span className={cx('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200', className)}>
    Segera hadir
  </span>
);

export const EmptyState: React.FC<{ icon?: LucideIcon; title: string; description?: string; action?: React.ReactNode }> = ({
  icon,
  title,
  description,
  action,
}) => (
  <div className="h-full flex flex-col items-center justify-center text-center py-6 px-4">
    {icon && <IconTile icon={icon} tone="slate" size="lg" round />}
    <h3 className="text-sm font-bold text-brand-ink mt-2.5">{title}</h3>
    {description && <p className="text-xs text-brand-muted mt-1 max-w-xs">{description}</p>}
    {action && <div className="mt-3">{action}</div>}
  </div>
);

export const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cx('animate-pulse rounded-xl bg-slate-100', className)} />
);

export const LegendRow: React.FC<{ tone: Tone; label: string; value: React.ReactNode }> = ({ tone, label, value }) => (
  <div className="flex items-center justify-between gap-3 text-xs">
    <span className="flex items-center gap-2 text-slate-600 min-w-0">
      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: TONE_HEX[tone] }} />
      <span className="truncate">{label}</span>
    </span>
    <span className="font-bold text-brand-ink">{value}</span>
  </div>
);
