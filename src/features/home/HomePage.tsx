import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  FileText, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  ClipboardList, 
  ChevronRight, 
  ChevronDown,
  RotateCw, 
  Calendar,
  Layers
} from 'lucide-react';
import { apiFetch, getActiveDevUser } from '../../lib/api';
import { Card, StatusBadge } from '../../components/ui/primitives';
import { QasBanner } from '../../components/ui/brand';

interface DashboardKPIs {
  total_cycles: number;
  total_audits: number;
  submitted_audits: number;
  in_progress_audits: number;
  avg_self_score: number | null;
  avg_official_score: number | null;
  overall_gap: number | null;
  compliance_rate: number;
}

interface DashboardData {
  kpis: DashboardKPIs;
  depots: Array<{
    depot_id: string;
    depot_code: string;
    depot_name: string;
    self_status: string;
    official_status: string;
  }>;
  available_cycles: Array<{ id: string; code: string; title: string }>;
}

interface RecentAuditItem {
  id: string;
  title: string;
  depot: string;
  type: string;
  date: string;
  status: string;
}

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDepotDetails, setShowDepotDetails] = useState(false);
  const activeUser = getActiveDevUser();

  useEffect(() => {
    async function loadDashboard() {
      try {
        setLoading(true);
        const res = await apiFetch<DashboardData>('/api/dashboard');
        if (res.success && res.data) {
          setData(res.data);
        }
      } catch (err) {
        console.warn('Gagal memuat dashboard:', err);
      } finally {
        setLoading(false);
      }
    }
    loadDashboard();
  }, []);

  const totalAudits = data?.kpis?.total_audits ?? 0;
  const selesaiAudits = data?.kpis?.submitted_audits ?? 0;
  const prosesAudits = data?.kpis?.in_progress_audits ?? 0;

  const selesaiPct = totalAudits > 0 ? Math.round((selesaiAudits / totalAudits) * 100) : 0;
  const prosesPct = totalAudits > 0 ? Math.round((prosesAudits / totalAudits) * 100) : 0;
  const periodLabel = (() => {
    const source = data?.available_cycles?.[0]?.title || '';
    const found = source.match(/(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)(?:\s+\d{4})?/i);
    return found?.[0] || new Date().toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  })();

  const todayStr = new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  // Recent audit items: dinamis dari data server atau kosong murni (0 demo)
  const recentAudits: RecentAuditItem[] = [];

  // Daftar depo lengkap: Karawang, Baros, Cirebon
  const displayDepots = (data?.depots && data.depots.length >= 3)
    ? data.depots
    : [
        {
          depot_id: 'depot-krw',
          depot_code: 'KRW',
          depot_name: 'Depo Karawang',
          self_status: data?.depots?.find((d) => d.depot_code === 'KRW')?.self_status || 'DRAFT',
          official_status: data?.depots?.find((d) => d.depot_code === 'KRW')?.official_status || 'DRAFT',
        },
        {
          depot_id: 'depot-brs',
          depot_code: 'BRS',
          depot_name: 'Depo Baros',
          self_status: data?.depots?.find((d) => d.depot_code === 'BRS')?.self_status || 'DRAFT',
          official_status: data?.depots?.find((d) => d.depot_code === 'BRS')?.official_status || 'DRAFT',
        },
        {
          depot_id: 'depot-crb',
          depot_code: 'CRB',
          depot_name: 'Depo Cirebon',
          self_status: data?.depots?.find((d) => d.depot_code === 'CRB')?.self_status || 'DRAFT',
          official_status: data?.depots?.find((d) => d.depot_code === 'CRB')?.official_status || 'DRAFT',
        },
      ];

  return (
    <div className="h-full flex flex-col overflow-hidden gap-2.5 sm:gap-3 pb-1">
      {/* ================= AREA TETAP (FIXED) ================= */}
      {/* 1. Header Sapaan & Tanggal */}
      <div className="flex items-center justify-between gap-2 pb-1 border-b border-brand-line flex-shrink-0">
        <div>
          <h1 className="text-base sm:text-lg font-black text-brand-ink tracking-tight">Selamat datang</h1>
          <p className="text-[11px] sm:text-xs font-semibold text-slate-500 truncate">{activeUser.profile.fullName}</p>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-white px-2.5 py-1 rounded-xl border border-brand-line shadow-2xs flex-shrink-0">
          <Calendar className="w-3.5 h-3.5 text-brand-red" />
          <span className="font-semibold text-[11px]">{todayStr}</span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            title="Muat ulang data"
            className="text-slate-400 hover:text-brand-ink ml-0.5 p-0.5 rounded cursor-pointer"
          >
            <RotateCw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* 2. Empat Kartu KPI Utama - Tetap di Atas, Fokus Angka, 2 Kolom Mobile */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 flex-shrink-0">
        <div className="rounded-xl border border-brand-line bg-white p-3 shadow-2xs hover:border-slate-300 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Aktivitas Audit</span>
            <div className="w-6 h-6 rounded-lg bg-blue-50 text-brand-blue flex items-center justify-center">
              <FileText className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-xl sm:text-2xl font-black text-slate-900 leading-none">
              {loading ? '...' : totalAudits}
            </span>
            <span className="text-[10px] font-semibold text-slate-400">Self & Resmi</span>
          </div>
        </div>

        <div className="rounded-xl border border-brand-line bg-white p-3 shadow-2xs hover:border-slate-300 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Dalam Proses</span>
            <div className="w-6 h-6 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-xl sm:text-2xl font-black text-amber-600 leading-none">
              {loading ? '...' : prosesAudits}
            </span>
            <span className="text-[10px] font-semibold text-slate-400">{prosesPct}%</span>
          </div>
        </div>

        <div className="rounded-xl border border-brand-line bg-white p-3 shadow-2xs hover:border-slate-300 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Selesai</span>
            <div className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-xl sm:text-2xl font-black text-emerald-600 leading-none">
              {loading ? '...' : selesaiAudits}
            </span>
            <span className="text-[10px] font-semibold text-slate-400">{selesaiPct}%</span>
          </div>
        </div>

        <div className="rounded-xl border border-brand-line bg-white p-3 shadow-2xs hover:border-slate-300 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Kepatuhan</span>
            <div className="w-6 h-6 rounded-lg bg-red-50 text-brand-red flex items-center justify-center">
              <AlertCircle className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-xl sm:text-2xl font-black text-slate-900 leading-none">
              {loading ? '...' : `${data?.kpis?.compliance_rate ?? 0}%`}
            </span>
            <span className="text-[10px] font-semibold text-slate-400">Target 100%</span>
          </div>
        </div>
      </div>

      {/* ================= AREA SCROLLABLE (VERTIKAL TANPA SCROLLBAR ANIMASI) ================= */}
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar flex flex-col gap-2.5 sm:gap-3">
        {/* 2b. Kartu Periode: 1 Baris Ramping (Awalnya selalu tersembunyi, klik untuk toggle detail Karawang, Baros, Cirebon) */}
        <div className="rounded-xl border border-brand-line bg-white shadow-2xs flex-shrink-0 overflow-hidden transition-all">
          <button
            type="button"
            onClick={() => setShowDepotDetails((prev) => !prev)}
            className="w-full flex items-center justify-between p-2.5 sm:p-3 text-left hover:bg-slate-50/80 transition-colors cursor-pointer min-h-[44px]"
            aria-expanded={showDepotDetails}
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded-lg bg-red-50 text-brand-red flex items-center justify-center flex-shrink-0">
                <Layers className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-bold text-brand-ink truncate">
                Periode • {periodLabel}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 text-[11px] text-slate-500 font-semibold">
              <span className="hidden sm:inline text-[10px] text-slate-400">Karawang, Baros, Cirebon</span>
              <ChevronDown
                className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
                  showDepotDetails ? 'rotate-180 text-brand-red' : ''
                }`}
              />
            </div>
          </button>

          {showDepotDetails && (
            <div className="p-3 pt-0 border-t border-slate-100">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-2.5">
                {displayDepots.map((d) => (
                  <div key={d.depot_id} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/60 text-xs flex flex-col gap-1.5">
                    <span className="font-bold text-slate-800 truncate">{d.depot_name}</span>
                    <div className="flex items-center justify-between text-[11px] text-slate-600">
                      <span>Self Audit:</span>
                      <span className={`font-bold ${d.self_status === 'SUBMITTED' ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {d.self_status === 'SUBMITTED' ? 'Selesai' : 'Dalam Proses'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-600">
                      <span>Audit Resmi:</span>
                      <span className={`font-bold ${d.official_status === 'SUBMITTED' ? 'text-emerald-600' : d.self_status === 'SUBMITTED' ? 'text-blue-600' : 'text-slate-400'}`}>
                        {d.official_status === 'SUBMITTED' ? 'Selesai' : d.self_status === 'SUBMITTED' ? 'Dalam Proses' : 'Terkunci'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 3. Baris Konten: Progres Audit Terbaru (Tombol Mulai Audit dihapus dari header card) & Banner QAS */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-1 min-h-[220px]">
          {/* Kolom Kiri: Progres Audit Terbaru */}
          <Card
            className="lg:col-span-7 flex flex-col min-h-0"
            title="Progres Audit Terbaru"
            bodyClassName="p-2.5 sm:p-3 overflow-y-auto no-scrollbar flex-1 space-y-2 flex flex-col justify-center"
          >
            {recentAudits.length === 0 ? (
              <div className="py-6 px-4 flex flex-col items-center justify-center text-center text-slate-400 gap-3 my-auto">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
                  <ClipboardList className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-700">Belum ada riwayat audit yang disubmit</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Siklus aktif siap dimulai.</p>
                </div>
                {/* Tombol Mulai Audit Lebar (Full-width, Min-height 44px Mobile Friendly) */}
                <Link
                  to="/audits"
                  className="w-full min-h-[44px] px-4 rounded-xl bg-brand-red text-white text-xs font-bold flex items-center justify-center gap-2 shadow-2xs hover:bg-brand-redDark active:scale-[0.99] transition-all cursor-pointer mt-1"
                >
                  <ClipboardList className="w-4 h-4" />
                  <span>Mulai Audit</span>
                  <ChevronRight className="w-4 h-4 ml-0.5" />
                </Link>
              </div>
            ) : (
              recentAudits.map((item) => (
                <div
                  key={item.id}
                  onClick={() => navigate('/audits')}
                  className="flex items-center justify-between p-2.5 rounded-xl border border-brand-line hover:border-slate-300 hover:bg-slate-50/80 transition-all cursor-pointer gap-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-brand-blue flex items-center justify-center flex-shrink-0">
                      <ClipboardList className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-brand-ink leading-tight truncate">
                        {item.title}
                      </h4>
                      <p className="text-[10px] text-brand-muted mt-0.5 truncate">
                        {item.depot} • {item.type}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[10px] text-slate-400 hidden sm:inline-block">
                      {item.date}
                    </span>
                    <StatusBadge status={item.status} />
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </div>
                </div>
              ))
            )}
          </Card>

          {/* Kolom Kanan: Banner 3D QAS Promo Asset */}
          <div className="lg:col-span-5 hidden lg:flex flex-col min-h-0">
            <QasBanner className="h-full min-h-[190px]" />
          </div>
        </div>
      </div>
    </div>
  );
};
