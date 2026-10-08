import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Calendar, 
  Lock, 
  Unlock, 
  ArrowRight, 
  Building2, 
  User, 
  Eye, 
  FileCheck2,
  Trash2,
  AlertCircle,
  RotateCw,
  X
} from 'lucide-react';
import { 
  apiFetch, 
  getActiveDevUser, 
  getUserAssignedDepots, 
  getUserActiveDepotId, 
  setUserActiveDepotId, 
  DEPOTS,
  getStoredAuditRecord,
  getStoredAuditAnswers
} from '../../lib/api';
import { getStoredDraftSummary } from '../../lib/offlineDraft';
import { StatusBadge, Button } from '../../components/ui/primitives';
import { calculateQASAuditIndex, getQASPredicate, getQASPredicateBadgeColors } from '../../lib/scoring';

interface AuditSlot {
  id: string;
  cycle_id: string;
  depot_id: string;
  audit_type: 'SELF' | 'OFFICIAL';
  status: 'DRAFT' | 'SUBMITTED' | 'REOPENED' | 'VOID';
  assigned_user_id: string;
  started_at?: string | null;
  submitted_at: string | null;
  score?: number | null;
  version?: number;
  answer_count?: number;
  evidence_count?: number;
}

interface CycleItem {
  id: string;
  code: string;
  title: string;
  period_start: string;
  period_end: string;
  self_due_at: string;
  official_due_at: string;
  status: 'DRAFT' | 'OPEN' | 'CLOSED';
  template_version_id: string;
  audits: AuditSlot[];
}

// Available monthly cycles (Hanya nama bulan)
const AVAILABLE_CYCLES = [
  { code: 'CYC-2026-10', label: 'Oktober' },
  { code: 'CYC-2026-09', label: 'September' },
  { code: 'CYC-2026-08', label: 'Agustus' },
  { code: 'CYC-2026-07', label: 'Juli' },
];

export const CycleListPage: React.FC = () => {
  const navigate = useNavigate();
  const [activeUser, setActiveUser] = useState(() => getActiveDevUser());
  const assignedDepots = useMemo(() => getUserAssignedDepots(activeUser), [activeUser]);
  const [activeDepotId, setActiveDepotId] = useState<string>(() => getUserActiveDepotId(activeUser));

  const [selectedCycleCode, setSelectedCycleCode] = useState<string>('cyc-prod-krw-202610');
  const [cycles, setCycles] = useState<CycleItem[]>([]);
  const [, setLoading] = useState(false);
  const [resetTick, setResetTick] = useState(0);
  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [startError, setStartError] = useState<{ code: string; message: string; requestId?: string } | null>(null);
  const [startingSelf, setStartingSelf] = useState(false);
  const [startingOfficial, setStartingOfficial] = useState(false);

  // Sync user, depot changes, audit updates, and drafts
  useEffect(() => {
    const handleAuthChange = () => {
      const u = getActiveDevUser();
      setActiveUser(u);
      setActiveDepotId(getUserActiveDepotId(u));
    };
    const handleDepotChange = () => {
      setActiveDepotId(getUserActiveDepotId());
    };
    const handleReset = () => {
      setResetTick((t) => t + 1);
    };
    window.addEventListener('qas-auth-changed', handleAuthChange);
    window.addEventListener('qas-role-changed', handleAuthChange);
    window.addEventListener('qas-depot-changed', handleDepotChange);
    window.addEventListener('qas-audits-reset', handleReset);
    window.addEventListener('qas-audits-updated', handleReset);
    window.addEventListener('qas-draft-changed', handleReset);
    window.addEventListener('storage', handleReset);
    return () => {
      window.removeEventListener('qas-auth-changed', handleAuthChange);
      window.removeEventListener('qas-role-changed', handleAuthChange);
      window.removeEventListener('qas-depot-changed', handleDepotChange);
      window.removeEventListener('qas-audits-reset', handleReset);
      window.removeEventListener('qas-audits-updated', handleReset);
      window.removeEventListener('qas-draft-changed', handleReset);
      window.removeEventListener('storage', handleReset);
    };
  }, []);

  // Load cycle data from server D1
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const res = await apiFetch<CycleItem[]>('/api/cycles');
        if (res.success && res.data && Array.isArray(res.data) && res.data.length > 0) {
          const cycleList = res.data;
          setCycles(cycleList);
          setSelectedCycleCode((prev) => {
            const found = cycleList.some((c) => c.code === prev || c.id === prev);
            return found ? prev : (cycleList[0].code || cycleList[0].id);
          });
        }
      } catch (err) {
        console.warn('Gagal memuat siklus:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [resetTick]);

  const activeDepot = DEPOTS.find((d) => d.id === activeDepotId) || DEPOTS[0];

  // Dynamic available cycles from server with fallback
  const availableCycles = useMemo(() => {
    if (cycles.length === 0) {
      return AVAILABLE_CYCLES;
    }
    return cycles.map((c) => ({
      code: c.code || c.id,
      label: new Date(`${c.period_start}T00:00:00`).toLocaleDateString('id-ID', {
        month: 'long',
      }),
    }));
  }, [cycles]);

  // Determine status & scores for the 2 cards based on cycle, depot & offline drafts dynamically
  const auditState = useMemo(() => {
    void resetTick; // Track reset events to refresh dynamic audit records

    // Cari siklus yang sesuai dari data D1 server
    const currentCycle = cycles.find((c) => c.code === selectedCycleCode || c.id === selectedCycleCode) || cycles[0];

    // Ambil slot audit nyata dari siklus server
    const selfSlot = currentCycle?.audits?.find(
      (a) => a.audit_type === 'SELF' && a.depot_id === activeDepot.id
    );
    const officialSlot = currentCycle?.audits?.find(
      (a) => a.audit_type === 'OFFICIAL' && a.depot_id === activeDepot.id
    );

    // Gunakan ID asli dari server jika tersedia; fallback ke naming convention deterministik
    const cycleSlug = (currentCycle?.code || selectedCycleCode || '202610').toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const fallbackSelfId = `audit-self-${activeDepot.code.toLowerCase()}-${cycleSlug}`;
    const fallbackOffId = `audit-off-${activeDepot.code.toLowerCase()}-${cycleSlug}`;

    // Selalu pastikan ada valid ID fallback agar audit tidak gagal dimulai
    const selfAuditId = selfSlot?.id || fallbackSelfId;
    const officialAuditId = officialSlot?.id || fallbackOffId;

    const selfRecord = import.meta.env.DEV && selfAuditId ? getStoredAuditRecord(selfAuditId) : null;
    const officialRecord = import.meta.env.DEV && officialAuditId ? getStoredAuditRecord(officialAuditId) : null;

    const selfAnswers = import.meta.env.DEV && selfAuditId ? getStoredAuditAnswers(selfAuditId) : {};
    const offAnswers = import.meta.env.DEV && officialAuditId ? getStoredAuditAnswers(officialAuditId) : {};

    const selfAnsweredCount = Object.values(selfAnswers).filter((a) => a?.option_id).length;
    const selfEvidenceCount = Object.values(selfAnswers).reduce((acc, a) => acc + (a?.evidence?.length || 0), 0);

    const offAnsweredCount = Object.values(offAnswers).filter((a) => a?.option_id).length;
    const offEvidenceCount = Object.values(offAnswers).reduce((acc, a) => acc + (a?.evidence?.length || 0), 0);

    const selfDraft = import.meta.env.DEV && selfAuditId ? getStoredDraftSummary(selfAuditId) : null;
    const offDraft = import.meta.env.DEV && officialAuditId ? getStoredDraftSummary(officialAuditId) : null;

    const isSelfSubmitted = (selfSlot?.status === 'SUBMITTED') || (selfRecord?.status === 'SUBMITTED');
    const isOffSubmitted = (officialSlot?.status === 'SUBMITTED') || (officialRecord?.status === 'SUBMITTED');

    const selfStarted = Boolean(selfSlot?.started_at);
    const officialStarted = Boolean(officialSlot?.started_at);

    const selfAnswered = selfSlot?.answer_count ?? (isSelfSubmitted ? 17 : (selfDraft?.answeredCount ?? selfAnsweredCount));
    const selfEvidence = selfSlot?.evidence_count ?? (selfDraft?.evidenceCount ?? selfEvidenceCount);

    const offAnswered = officialSlot?.answer_count ?? (isOffSubmitted ? 17 : (offDraft?.answeredCount ?? offAnsweredCount));
    const offEvidence = officialSlot?.evidence_count ?? (offDraft?.evidenceCount ?? offEvidenceCount);

    const selfScoring = calculateQASAuditIndex(selfAnswers);
    const offScoring = calculateQASAuditIndex(offAnswers);

    const selfScoreVal = selfSlot?.score ?? selfRecord?.score;
    const selfIndexFormatted = isSelfSubmitted
      ? (selfScoreVal !== null && selfScoreVal !== undefined
          ? (selfScoreVal <= 5.0 ? selfScoreVal.toFixed(2) : (selfScoreVal / 20).toFixed(2))
          : selfScoring.indexFormatted)
      : null;
    const selfPredicate = selfIndexFormatted ? getQASPredicate(Number(selfIndexFormatted)) : null;
    const selfPredicateColors = selfPredicate ? getQASPredicateBadgeColors(selfPredicate) : null;

    const offScoreVal = officialSlot?.score ?? officialRecord?.score;
    const offIndexFormatted = isOffSubmitted
      ? (offScoreVal !== null && offScoreVal !== undefined
          ? (offScoreVal <= 5.0 ? offScoreVal.toFixed(2) : (offScoreVal / 20).toFixed(2))
          : offScoring.indexFormatted)
      : null;
    const offPredicate = offIndexFormatted ? getQASPredicate(Number(offIndexFormatted)) : null;
    const offPredicateColors = offPredicate ? getQASPredicateBadgeColors(offPredicate) : null;

    return {
      cycleId: currentCycle?.id || '',
      cycleCode: currentCycle?.code || selectedCycleCode,
      selfAuditId,
      selfSlot,
      selfStarted,
      selfStatus: isSelfSubmitted ? ('SUBMITTED' as const) : ('DRAFT' as const),
      selfScore: isSelfSubmitted ? (selfScoreVal ?? null) : null,
      selfIndexFormatted,
      selfPredicate,
      selfPredicateColors,
      selfAnswered,
      selfEvidenceCount: selfEvidence,
      selfSubmittedDate: isSelfSubmitted ? (selfSlot?.submitted_at ?? selfRecord?.submitted_at ?? null) : null,
      officialAuditId,
      officialSlot,
      officialStarted,
      officialStatus: isOffSubmitted ? ('SUBMITTED' as const) : ('DRAFT' as const),
      officialScore: isOffSubmitted ? (offScoreVal ?? null) : null,
      officialIndexFormatted: offIndexFormatted,
      officialPredicate: offPredicate,
      officialPredicateColors: offPredicateColors,
      officialAnswered: offAnswered,
      officialEvidenceCount: offEvidence,
      officialSubmittedDate: isOffSubmitted ? (officialSlot?.submitted_at ?? officialRecord?.submitted_at ?? null) : null,
      isOfficialLocked: !isSelfSubmitted, // STRICT GATING: locked until Self Audit is submitted!
    };
  }, [cycles, selectedCycleCode, activeDepot, resetTick]);

  // RBAC checks for action buttons
  const isPicUser = activeUser.profile.primaryRole === 'PIC_QAS';
  const isAuditorUser = activeUser.profile.primaryRole === 'AUDITOR_QAS' || activeUser.profile.primaryRole === 'ADMIN';
  const isAssignedDepot = activeUser.profile.isGlobalAccess || 
    activeUser.profile.scopes.some((s) => s.depotId === activeDepot.id);

  const handleStartSelfAudit = async () => {
    setStartError(null);
    let auditId = auditState.selfAuditId;

    // Jika sudah pernah dimulai atau ada jawaban, langsung navigasi
    if (auditId && (auditState.selfStarted || auditState.selfAnswered > 0)) {
      navigate(`/audits/${auditId}`);
      return;
    }

    setStartingSelf(true);
    try {
      // 1. Jika slot belum ada atau baru, buat/ambil via POST /api/cycles/:id/self
      if (!auditState.selfSlot && auditState.cycleId) {
        const createRes = await apiFetch<{ id: string; started_at?: string }>(
          `/api/cycles/${auditState.cycleId}/self`,
          {
            method: 'POST',
            body: JSON.stringify({ depot_id: activeDepot.id }),
          }
        );
        if (createRes.success && createRes.data?.id) {
          auditId = createRes.data.id;
        }
      }

      if (!auditId) {
        setStartError({
          code: 'AUDIT_ID_MISSING',
          message: 'Slot Self Audit tidak ditemukan pada siklus aktif untuk depo ini.',
        });
        return;
      }

      const res = await apiFetch<{ id: string; started_at: string }>(`/api/audits/${auditId}/start`, {
        method: 'POST',
      });
      if (res.success) {
        navigate(`/audits/${auditId}`);
      } else {
        const errorInfo = res.error as { code?: string; message?: string; requestId?: string } | undefined;
        const resObj = res as { requestId?: string };
        setStartError({
          code: res.error?.code || 'START_AUDIT_FAILED',
          message: res.error?.message || 'Gagal memulai Self Audit.',
          requestId: resObj.requestId || errorInfo?.requestId,
        });
      }
    } catch (err: unknown) {
      const errorObj = err as { code?: string; message?: string; requestId?: string } | undefined;
      setStartError({
        code: errorObj?.code || 'NETWORK_OR_SERVER_ERROR',
        message: errorObj?.message || 'Terjadi kesalahan saat memulai Self Audit.',
        requestId: errorObj?.requestId,
      });
    } finally {
      setStartingSelf(false);
    }
  };

  const handleStartOfficialAudit = async () => {
    setStartError(null);
    let auditId = auditState.officialAuditId;

    // Jika sudah pernah dimulai atau ada jawaban, langsung navigasi
    if (auditId && (auditState.officialStarted || auditState.officialAnswered > 0)) {
      navigate(`/audits/${auditId}`);
      return;
    }

    setStartingOfficial(true);
    try {
      // 1. Jika slot belum ada atau baru, buat/ambil via POST /api/cycles/:id/official
      if (!auditState.officialSlot && auditState.cycleId) {
        const createRes = await apiFetch<{ id: string; started_at?: string }>(
          `/api/cycles/${auditState.cycleId}/official`,
          {
            method: 'POST',
            body: JSON.stringify({ depot_id: activeDepot.id }),
          }
        );
        if (createRes.success && createRes.data?.id) {
          auditId = createRes.data.id;
        }
      }

      if (!auditId) {
        setStartError({
          code: 'AUDIT_ID_MISSING',
          message: 'Slot Audit Resmi tidak ditemukan pada siklus aktif untuk depo ini.',
        });
        return;
      }

      const res = await apiFetch<{ id: string; started_at: string }>(`/api/audits/${auditId}/start`, {
        method: 'POST',
      });
      if (res.success) {
        navigate(`/audits/${auditId}`);
      } else {
        const errorInfo = res.error as { code?: string; message?: string; requestId?: string } | undefined;
        const resObj = res as { requestId?: string };
        setStartError({
          code: res.error?.code || 'START_AUDIT_FAILED',
          message: res.error?.message || 'Gagal memulai Audit Resmi.',
          requestId: resObj.requestId || errorInfo?.requestId,
        });
      }
    } catch (err: unknown) {
      const errorObj = err as { code?: string; message?: string; requestId?: string } | undefined;
      setStartError({
        code: errorObj?.code || 'NETWORK_OR_SERVER_ERROR',
        message: errorObj?.message || 'Terjadi kesalahan saat memulai Audit Resmi.',
        requestId: errorObj?.requestId,
      });
    } finally {
      setStartingOfficial(false);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden p-2.5 sm:p-4 max-w-4xl mx-auto w-full gap-2.5">
      {/* 1. Filter Bulan (Pertama) */}
      <div className="flex items-center justify-between gap-2 pb-1 flex-shrink-0 w-full">
        <div className="relative flex-1 sm:max-w-xs">
          <select
            value={selectedCycleCode}
            onChange={(e) => setSelectedCycleCode(e.target.value)}
            className="w-full h-10 pl-8 pr-3 rounded-xl bg-white border border-brand-line text-xs font-bold text-slate-800 outline-none hover:border-slate-300 focus:border-brand-red cursor-pointer shadow-2xs truncate"
          >
            {availableCycles.map((c) => (
              <option key={c.code} value={c.code}>
                Periode {c.label}
              </option>
            ))}
          </select>
          <Calendar className="w-4 h-4 text-brand-red absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
        <div className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-200/60 hidden xs:flex items-center gap-1">
          <Building2 className="w-3.5 h-3.5 text-slate-500" />
          <span>{assignedDepots.length} Depo Terdaftar</span>
        </div>
      </div>

      {/* 2. Panel Pilihan Depo (Tab Switcher untuk Multi-Depo, ramah sentuh min-h 44px) */}
      <div className="flex-shrink-0 w-full">
        {assignedDepots.length === 1 ? (
          <div className="h-11 px-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 flex items-center gap-2 shadow-2xs">
            <Building2 className="w-4 h-4 text-brand-red flex-shrink-0" />
            <span>Depo {assignedDepots[0].name}</span>
          </div>
        ) : (
          <div className="p-1 rounded-xl bg-slate-100 border border-slate-200/80 flex items-center gap-1 overflow-x-auto qas-scroll">
            {assignedDepots.map((d) => {
              const isActive = activeDepotId === d.id;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => {
                    setUserActiveDepotId(d.id);
                    setActiveDepotId(d.id);
                  }}
                  className={`flex-1 min-w-[100px] min-h-[44px] px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'bg-white text-brand-red shadow-sm border border-slate-200/60 font-black'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  <Building2 className={`w-3.5 h-3.5 ${isActive ? 'text-brand-red' : 'text-slate-400'}`} />
                  <span>Depo {d.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Banner Error Mulai Audit */}
      {startError && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 sm:p-4 text-xs shadow-xs animate-fade-in flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-rose-800 font-extrabold">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              <span>Gagal Memulai Audit [{startError.code}]</span>
            </div>
            <button
              type="button"
              onClick={() => setStartError(null)}
              className="text-rose-500 hover:text-rose-700 text-xs p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-rose-700 leading-relaxed font-medium">
            {startError.message}
          </p>
          {startError.requestId && (
            <p className="text-[10px] text-rose-500 font-mono">
              Request ID: {startError.requestId}
            </p>
          )}
        </div>
      )}

      {/* 3. DUA KARTU AUDIT ELEVASI DI TENGAH LAYAR */}
      <div className="flex flex-col gap-3.5 my-auto py-2">
        {/* KARTU 1 (ATAS): SELF AUDIT (PIC GUDANG) */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-md hover:shadow-lg transition-all flex flex-col justify-between gap-3">
          {/* Baris 1: Judul, Status & Index QAS */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-red-50 text-brand-red flex items-center justify-center font-bold flex-shrink-0 shadow-2xs border border-red-100">
                <User className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm sm:text-base font-black text-brand-ink truncate">
                    Self Audit (PIC)
                  </span>
                  <StatusBadge status={auditState.selfStatus} />
                </div>
                <span className="text-[11px] text-slate-400 font-medium hidden sm:block">Pemeriksaan mandiri standar kepatuhan depo</span>
              </div>
            </div>

            <div className="flex items-baseline gap-1.5 flex-shrink-0 bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-100">
              <span className="text-[10px] text-slate-400 font-bold uppercase">Index</span>
              <span className="text-base sm:text-lg font-black text-brand-ink">
                {auditState.selfIndexFormatted || '-'}
              </span>
              {auditState.selfIndexFormatted && auditState.selfPredicate && auditState.selfPredicateColors && (
                <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${auditState.selfPredicateColors.bg} ${auditState.selfPredicateColors.text} ${auditState.selfPredicateColors.border}`}>
                  {auditState.selfPredicate}
                </span>
              )}
            </div>
          </div>

          {/* Baris 2: Progres */}
          <div className="text-xs text-slate-500 pt-2 border-t border-slate-100 flex items-center justify-between">
            <span>
              Progres: <strong className="text-slate-800 font-bold">{auditState.selfAnswered}/17 Terjawab</strong>
              {auditState.selfEvidenceCount > 0 && <span className="text-slate-400 ml-1">({auditState.selfEvidenceCount} Foto)</span>}
            </span>
            {auditState.selfSubmittedDate && (
              <span className="text-[10px] text-slate-400">
                Disubmit: {new Date(auditState.selfSubmittedDate).toLocaleDateString('id-ID')}
              </span>
            )}
          </div>

          {/* Baris 3: Tombol Aksi Utama */}
          <div className="pt-1">
            {auditState.selfStatus === 'SUBMITTED' ? (
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-center font-bold min-h-[44px]"
                onClick={() => navigate(`/audits/${auditState.selfAuditId}`)}
              >
                <Eye className="w-4 h-4 mr-1.5" />
                <span>Lihat Hasil Self Audit</span>
              </Button>
            ) : isPicUser && isAssignedDepot ? (
              <Button
                variant="primary"
                size="sm"
                disabled={startingSelf}
                className="w-full justify-center font-bold min-h-[44px]"
                onClick={handleStartSelfAudit}
              >
                {startingSelf ? (
                  <>
                    <RotateCw className="w-4 h-4 mr-1.5 animate-spin" />
                    <span>Memulai Audit...</span>
                  </>
                ) : (
                  <>
                    <span>{auditState.selfAnswered > 0 || auditState.selfStarted ? 'Lanjutkan Self Audit' : 'Mulai Self Audit'}</span>
                    <ArrowRight className="w-4 h-4 ml-1.5" />
                  </>
                )}
              </Button>
            ) : (
              <button
                type="button"
                disabled
                className="w-full min-h-[44px] py-2 px-3 rounded-xl border border-slate-200 bg-slate-100 text-slate-400 text-xs font-bold flex items-center justify-center gap-1.5 cursor-not-allowed"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Menunggu PIC Gudang</span>
              </button>
            )}
          </div>
        </div>

        {/* KARTU 2 (BAWAH): AUDIT RESMI (AUDITOR QAS) */}
        <div className={`rounded-2xl border p-4 sm:p-5 flex flex-col justify-between gap-3 transition-all ${
          auditState.isOfficialLocked 
            ? 'border-amber-200/80 bg-amber-50/40 shadow-xs' 
            : 'border-slate-200/80 bg-white shadow-md hover:shadow-lg'
        }`}>
          {/* Baris 1: Judul, Status & Index QAS */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-brand-blue flex items-center justify-center font-bold flex-shrink-0 shadow-2xs border border-blue-100">
                <FileCheck2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm sm:text-base font-black text-brand-ink truncate">
                    Audit Resmi (QAR)
                  </span>
                  {auditState.isOfficialLocked ? (
                    <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                      <Lock className="w-3 h-3" />
                      <span>Terkunci</span>
                    </span>
                  ) : (
                    <StatusBadge status={auditState.officialStatus} />
                  )}
                </div>
                <span className="text-[11px] text-slate-400 font-medium hidden sm:block">Audit verifikasi mutu oleh Auditor QAS</span>
              </div>
            </div>

            <div className="flex items-baseline gap-1.5 flex-shrink-0 bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-100">
              <span className="text-[10px] text-slate-400 font-bold uppercase">Index</span>
              <span className="text-base sm:text-lg font-black text-brand-ink">
                {auditState.officialIndexFormatted || '-'}
              </span>
              {auditState.officialIndexFormatted && auditState.officialPredicate && auditState.officialPredicateColors && (
                <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${auditState.officialPredicateColors.bg} ${auditState.officialPredicateColors.text} ${auditState.officialPredicateColors.border}`}>
                  {auditState.officialPredicate}
                </span>
              )}
            </div>
          </div>

          {/* Baris 2: Progres */}
          <div className="text-xs text-slate-500 pt-2 border-t border-slate-100 flex items-center justify-between">
            <span>
              {auditState.isOfficialLocked ? (
                <span className="text-amber-700 font-medium">Menunggu Self Audit Selesai</span>
              ) : (
                <>
                  Verifikasi: <strong className="text-slate-800 font-bold">{auditState.officialAnswered}/17</strong>
                  {auditState.officialEvidenceCount > 0 && <span className="text-slate-400 ml-1">({auditState.officialEvidenceCount} Foto)</span>}
                </>
              )}
            </span>
            {auditState.officialSubmittedDate && (
              <span className="text-[10px] text-slate-400">
                Disubmit: {new Date(auditState.officialSubmittedDate).toLocaleDateString('id-ID')}
              </span>
            )}
          </div>

          {/* Baris 3: Tombol Aksi Utama */}
          <div className="pt-1">
            {auditState.isOfficialLocked ? (
              <button
                type="button"
                disabled
                className="w-full min-h-[44px] py-2 px-3 rounded-xl border border-amber-200 bg-amber-100/60 text-amber-800 text-xs font-bold flex items-center justify-center gap-1.5 cursor-not-allowed"
              >
                <Lock className="w-3.5 h-3.5 text-amber-700" />
                <span>Terkunci (Menunggu Self Audit)</span>
              </button>
            ) : isPicUser ? (
              <button
                type="button"
                disabled
                className="w-full min-h-[44px] py-2 px-3 rounded-xl border border-slate-200 bg-slate-100 text-slate-400 text-xs font-bold flex items-center justify-center gap-1.5 cursor-not-allowed"
                title="Khusus wewenang Auditor QAS"
              >
                <Lock className="w-3.5 h-3.5 text-slate-400" />
                <span>Khusus Auditor QAR</span>
              </button>
            ) : auditState.officialStatus === 'SUBMITTED' ? (
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-center font-bold min-h-[44px]"
                onClick={() => navigate(`/audits/${auditState.officialAuditId}`)}
              >
                <Eye className="w-4 h-4 mr-1.5" />
                <span>Lihat Hasil Audit Resmi</span>
              </Button>
            ) : isAuditorUser && isAssignedDepot ? (
              <Button
                variant="primary"
                size="sm"
                disabled={startingOfficial}
                className="w-full justify-center font-bold min-h-[44px]"
                onClick={handleStartOfficialAudit}
              >
                {startingOfficial ? (
                  <>
                    <RotateCw className="w-4 h-4 mr-1.5 animate-spin" />
                    <span>Memulai Audit...</span>
                  </>
                ) : (
                  <>
                    <Unlock className="w-3.5 h-3.5 mr-1" />
                    <span>{auditState.officialAnswered > 0 || auditState.officialStarted ? 'Lanjutkan Audit Resmi' : 'Mulai Audit Resmi'}</span>
                    <ArrowRight className="w-3.5 h-3.5 ml-1" />
                  </>
                )}
              </Button>
            ) : (
              <button
                type="button"
                disabled
                className="w-full min-h-[44px] py-2 px-3 rounded-xl border border-slate-200 bg-slate-100 text-slate-400 text-xs font-bold flex items-center justify-center gap-1.5 cursor-not-allowed"
              >
                <Lock className="w-3.5 h-3.5 text-slate-400" />
                <span>Khusus Auditor QAR</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3. MODAL KONFIRMASI HAPUS DATA DRAF */}
      {showResetConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-5 max-w-sm w-full mx-auto space-y-3.5 animate-scale-up">
            <div className="w-11 h-11 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center mx-auto text-rose-600 shadow-xs">
              <Trash2 className="w-5 h-5" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-sm font-extrabold text-slate-900">
                Konfirmasi Hapus Data Draf
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Hapus draf audit untuk <strong>Depo {activeDepot.name}</strong> periode <strong>{availableCycles.find((c) => c.code === selectedCycleCode)?.label}</strong>?
              </p>
              {auditState.selfStatus === 'SUBMITTED' || auditState.officialStatus === 'SUBMITTED' ? (
                <div className="mt-2 p-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800 font-semibold">
                  ⚠️ Perhatian: Data yang sudah SUBMITTED tidak dapat dihapus demi integritas mutu QAS.
                </div>
              ) : (
                <p className="text-[11px] text-slate-400">
                  Seluruh isian draf dan foto bukti yang belum disubmit akan dibersihkan kembali ke awal.
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                disabled={isResetting}
                onClick={() => setShowResetConfirmModal(false)}
                className="flex-1 py-2 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isResetting || auditState.selfStatus === 'SUBMITTED' || auditState.officialStatus === 'SUBMITTED'}
                onClick={async () => {
                  setIsResetting(true);
                  try {
                    await apiFetch(`/api/audits?cycle_id=${auditState.cycleId}&depot_id=${activeDepot.id}`, {
                      method: 'DELETE',
                    });
                    setResetTick((t) => t + 1);
                  } catch (err) {
                    console.warn('Gagal menghapus draft audit:', err);
                  } finally {
                    setIsResetting(false);
                    setShowResetConfirmModal(false);
                  }
                }}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                  auditState.selfStatus === 'SUBMITTED' || auditState.officialStatus === 'SUBMITTED'
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    : 'bg-rose-600 hover:bg-rose-700 text-white shadow-xs cursor-pointer'
                }`}
              >
                {isResetting ? 'Menghapus...' : 'Ya, Hapus Draf'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
