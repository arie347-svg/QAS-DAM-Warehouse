// Design tokens shared by UI primitives (non-component exports live here
// so component files stay compatible with React Fast Refresh).

export type Tone = 'red' | 'blue' | 'green' | 'amber' | 'purple' | 'slate' | 'navy';

export const TONE_TILE: Record<Tone, string> = {
  red: 'bg-brand-redSoft text-brand-red',
  blue: 'bg-brand-blueSoft text-brand-blue',
  green: 'bg-brand-greenSoft text-brand-green',
  amber: 'bg-brand-amberSoft text-brand-amber',
  purple: 'bg-brand-purpleSoft text-brand-purple',
  slate: 'bg-slate-100 text-slate-500',
  navy: 'bg-blue-50 text-brand-navy',
};

export const TONE_BADGE: Record<Tone, string> = {
  red: 'bg-brand-redSoft text-brand-red border-red-100',
  blue: 'bg-brand-blueSoft text-brand-blue border-blue-100',
  green: 'bg-brand-greenSoft text-brand-green border-green-100',
  amber: 'bg-brand-amberSoft text-amber-700 border-amber-100',
  purple: 'bg-brand-purpleSoft text-brand-purple border-purple-100',
  slate: 'bg-slate-100 text-slate-600 border-slate-200',
  navy: 'bg-blue-50 text-brand-navy border-blue-100',
};

export const TONE_HEX: Record<Tone, string> = {
  red: '#E11D2E',
  blue: '#2563EB',
  green: '#16A34A',
  amber: '#F59E0B',
  purple: '#7C3AED',
  slate: '#94A3B8',
  navy: '#1E3A8A',
};

/** Maps backend audit statuses to the mockup's Indonesian status pills. */
export function auditStatusMeta(status: string | null | undefined): { label: string; tone: Tone } {
  switch ((status || '').toUpperCase()) {
    case 'SUBMITTED':
    case 'FINALIZED':
    case 'ACKNOWLEDGED':
    case 'SELESAI':
      return { label: 'Selesai', tone: 'green' };
    case 'DRAFT':
    case 'IN_PROGRESS':
    case 'OPEN':
      return { label: 'Dalam Proses', tone: 'blue' };
    case 'REOPENED':
      return { label: 'Perlu Tindak Lanjut', tone: 'red' };
    case 'VOID':
    case 'CLOSED':
      return { label: 'Ditutup', tone: 'slate' };
    case 'NOT_STARTED':
    case '':
      return { label: 'Belum Mulai', tone: 'slate' };
    default:
      return { label: status || '-', tone: 'slate' };
  }
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function formatDateId(value: string | null | undefined, withTime = false): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const opts: Intl.DateTimeFormatOptions = withTime
    ? { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: 'numeric', month: 'short', year: 'numeric' };
  return d.toLocaleDateString('id-ID', opts);
}

export function roleLabel(role: string): string {
  if (role === 'ADMIN') return 'Admin Lead';
  if (role === 'AUDITOR_QAS') return 'Auditor QAS';
  return 'PIC QAS';
}
