import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiFetch, getActiveDevUser } from '../../lib/api';

interface QuestionComparisonItem {
  question_id: string;
  question_code: string;
  prompt: string;
  section_id: string;
  section_code: string;
  self_option_id: string | null;
  self_option_code: string | null;
  self_option_label: string | null;
  self_numeric_value: number | null;
  self_note: string | null;
  self_evidence_count: number;
  official_option_id: string | null;
  official_option_code: string | null;
  official_option_label: string | null;
  official_numeric_value: number | null;
  official_note: string | null;
  official_evidence_count: number;
  gap: number;
  status: 'MATCH' | 'SELF_HIGHER' | 'OFFICIAL_HIGHER' | 'DIFF_OPTION_SAME_SCORE' | 'NA';
  is_option_different?: boolean;
}

interface SectionComparisonItem {
  section_id: string;
  section_code: string;
  section_title: string;
  self_score: number | null;
  official_score: number | null;
  gap: number | null;
}

interface ComparisonData {
  id: string;
  cycle_id: string;
  depot_id: string;
  self_audit_id: string;
  official_audit_id: string;
  summary: {
    cycle_id: string;
    cycle_code: string;
    cycle_title: string;
    depot_id: string;
    depot_code: string;
    depot_name: string;
    self_audit_id: string;
    self_score: number | null;
    self_category: string | null;
    self_submitted_at: string | null;
    official_audit_id: string;
    official_score: number | null;
    official_category: string | null;
    official_submitted_at: string | null;
    score_gap: number | null;
    total_questions: number;
    match_count: number;
    mismatch_count: number;
    self_higher_count: number;
    official_higher_count: number;
    na_count: number;
    max_negative_gap_question: {
      code: string;
      gap: number;
      prompt: string;
    } | null;
    max_positive_gap_question?: {
      code: string;
      gap: number;
      prompt: string;
    } | null;
    questions_with_gap_count?: number;
    different_options_count?: number;
    section_comparisons: SectionComparisonItem[];
    question_comparisons: QuestionComparisonItem[];
    generated_at: string;
  };
  created_at: string;
  acknowledgement: {
    id: string;
    user_id: string;
    user_name: string;
    note: string | null;
    acknowledged_at: string;
  } | null;
}

export const ComparisonPage: React.FC = () => {
  const { cycleId, depotId } = useParams<{ cycleId: string; depotId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [data, setData] = useState<ComparisonData | null>(null);
  const [activeTab, setActiveTab] = useState<'SUMMARY' | 'MATRIX' | 'ACK'>('SUMMARY');
  const [filterMode, setFilterMode] = useState<'ALL' | 'MISMATCH' | 'MATCH'>('ALL');
  const [onlyGap, setOnlyGap] = useState(false);
  const [questionPageIndex, setQuestionPageIndex] = useState(0);
  const [ackNote, setAckNote] = useState('');
  const [submittingAck, setSubmittingAck] = useState(false);
  const [userRole, setUserRole] = useState<'PIC_QAS' | 'AUDITOR_QAS' | 'ADMIN'>('PIC_QAS');

  // Audit Trail states
  const [auditEvents, setAuditEvents] = useState<
    Array<{
      id: string;
      event_type: string;
      actor_name: string | null;
      reason: string | null;
      created_at: string;
    }>
  >([]);

  useEffect(() => {
    async function loadComparison() {
      if (!cycleId || !depotId) return;
      try {
        setLoading(true);
        setErrorMsg(null);

        const activeDevUser = getActiveDevUser();
        setUserRole(activeDevUser.profile.primaryRole);

        // Fetch Comparison Snapshot
        const json = await apiFetch<ComparisonData>(`/api/comparisons/${cycleId}/${depotId}`);

        if (json.success && json.data) {
          setData(json.data);
          if (json.data.official_audit_id) {
            try {
              const evJson = await apiFetch<{
                events: Array<{
                  id: string;
                  event_type: string;
                  actor_name: string | null;
                  reason: string | null;
                  created_at: string;
                }>;
              }>(`/api/audits/${json.data.official_audit_id}/events`);
              if (evJson.success && evJson.data?.events) {
                setAuditEvents(evJson.data.events);
              }
            } catch {
              // Silently ignore
            }
          }
        } else {
          setErrorMsg(json.error?.message || 'Gagal memuat hasil perbandingan.');
        }
      } catch {
        setErrorMsg('Gagal terhubung ke data komparasi.');
      } finally {
        setLoading(false);
      }
    }

    loadComparison();
  }, [cycleId, depotId]);

  // Handle Acknowledgement Submission
  const handleAcknowledge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data?.official_audit_id) return;

    try {
      setSubmittingAck(true);
      const json = await apiFetch<{
        id: string;
        official_audit_id: string;
        acknowledged_at: string;
      }>(`/api/audits/${data.official_audit_id}/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: ackNote }),
      });

      if (json.success) {
        setData((prev) =>
          prev
            ? {
                ...prev,
                acknowledgement: {
                  id: json.data?.id || 'ack-new',
                  user_id: 'current-user',
                  user_name: 'PIC Gudang ' + (data?.summary.depot_name || ''),
                  note: ackNote || null,
                  acknowledged_at: json.data?.acknowledged_at || new Date().toISOString(),
                },
              }
            : null
        );
      } else {
        alert(json.error?.message || 'Gagal melakukan konfirmasi hasil.');
      }
    } catch {
      alert('Koneksi terganggu.');
    } finally {
      setSubmittingAck(false);
    }
  };

  const summary = data?.summary;

  const questionsWithGap = useMemo(() => {
    if (!summary?.question_comparisons) return [];
    return summary.question_comparisons.filter((q) => {
      const isDiff = q.is_option_different ?? (q.self_option_id !== q.official_option_id);
      return Math.abs(q.gap) > 0 || isDiff;
    });
  }, [summary]);

  const questionsWithDifferentOptions = useMemo(() => {
    if (!summary?.question_comparisons) return [];
    return summary.question_comparisons.filter((q) => {
      return q.is_option_different ?? (q.self_option_id !== q.official_option_id);
    });
  }, [summary]);

  const maxPositiveGap = useMemo(() => {
    if (summary?.max_positive_gap_question) return summary.max_positive_gap_question;
    if (!summary?.question_comparisons) return null;
    let maxGap = 0;
    let maxItem: { code: string; gap: number; prompt: string } | null = null;
    for (const q of summary.question_comparisons) {
      if (q.gap > maxGap) {
        maxGap = q.gap;
        maxItem = { code: q.question_code, gap: q.gap, prompt: q.prompt };
      }
    }
    return maxItem;
  }, [summary]);

  const maxNegativeGap = useMemo(() => {
    if (summary?.max_negative_gap_question) return summary.max_negative_gap_question;
    if (!summary?.question_comparisons) return null;
    let minGap = 0;
    let minItem: { code: string; gap: number; prompt: string } | null = null;
    for (const q of summary.question_comparisons) {
      if (q.gap < minGap) {
        minGap = q.gap;
        minItem = { code: q.question_code, gap: q.gap, prompt: q.prompt };
      }
    }
    return minItem;
  }, [summary]);

  const filteredQuestions = useMemo(() => {
    if (!summary?.question_comparisons) return [];
    return summary.question_comparisons.filter((q) => {
      const isDiff = q.is_option_different ?? (q.self_option_id !== q.official_option_id);
      const hasGap = Math.abs(q.gap) > 0 || isDiff;

      // Filter OBS-03: Hanya Gap > 0
      if (onlyGap && !hasGap) {
        return false;
      }

      if (filterMode === 'MISMATCH') return q.status !== 'MATCH';
      if (filterMode === 'MATCH') return q.status === 'MATCH';
      return true;
    });
  }, [summary, onlyGap, filterMode]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-slate-500">
        Memuat matriks komparasi audit...
      </div>
    );
  }

  if (errorMsg || !data || !summary) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-4">
        <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 font-bold flex items-center justify-center mb-2">
          !
        </div>
        <h2 className="text-sm font-bold text-slate-900">Perbandingan Belum Tersedia</h2>
        <p className="text-xs text-slate-500 mt-1 max-w-sm">
          {errorMsg || 'Audit Resmi untuk depo ini belum diselesaikan oleh auditor.'}
        </p>
        <button
          onClick={() => navigate('/audits')}
          className="mt-3 px-4 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg shadow-xs"
        >
          Kembali ke Daftar Siklus
        </button>
      </div>
    );
  }

  const questionsPerPage = 2;
  const totalQuestionPages = Math.max(1, Math.ceil(filteredQuestions.length / questionsPerPage));
  const pageQuestions = filteredQuestions.slice(
    questionPageIndex * questionsPerPage,
    (questionPageIndex + 1) * questionsPerPage
  );

  return (
    <div className="h-full flex flex-col justify-between overflow-hidden text-slate-800">
      {/* 1. Header Toolbar (Icon-Free) */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-[0_1px_2px_rgba(0,0,0,0.03)] px-3 sm:px-4 py-2 flex items-center justify-between gap-2 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => navigate('/audits')}
            className="px-2 py-1 rounded-lg text-slate-600 hover:text-blue-600 text-xs font-bold hover:bg-slate-50 transition-colors"
          >
            &larr; <span className="hidden sm:inline">Daftar</span>
          </button>
          <div className="truncate">
            <div className="flex items-center gap-1.5">
              <span className="text-xs sm:text-sm font-extrabold text-slate-900">
                Komparasi: Gudang {summary.depot_name}
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 bg-slate-100 text-slate-700 rounded font-bold">
                {summary.depot_code}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-medium hidden sm:block truncate">
              {summary.cycle_title} &bull; Selesai {new Date(summary.generated_at).toLocaleDateString('id-ID')}
            </p>
          </div>
        </div>

        {/* Tab Pills */}
        <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-xs font-bold flex-shrink-0">
          <button
            onClick={() => setActiveTab('SUMMARY')}
            className={`px-2.5 py-1 rounded-md transition-all ${
              activeTab === 'SUMMARY'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Ringkasan
          </button>
          <button
            onClick={() => { setActiveTab('MATRIX'); setQuestionPageIndex(0); }}
            className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1 ${
              activeTab === 'MATRIX'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>Matriks Soal</span>
            {questionsWithGap.length > 0 && (
              <span className="text-[9px] px-1 py-0.2 rounded-full bg-amber-100 text-amber-800 font-mono">
                {questionsWithGap.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('ACK')}
            className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1 ${
              activeTab === 'ACK'
                ? 'bg-white text-emerald-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Berita Acara
            {data.acknowledgement && <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1 rounded font-mono">OK</span>}
          </button>
        </div>
      </div>

      {/* 2. Main Content View Area */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-[0_1px_2px_rgba(0,0,0,0.03)] p-3 sm:p-4 flex-1 flex flex-col justify-between overflow-hidden min-h-0 my-1">
        {/* TAB 1: SUMMARY */}
        {activeTab === 'SUMMARY' && (
          <div className="h-full flex flex-col justify-between overflow-y-auto qas-scroll gap-3 pr-1">
            {/* 3 Score Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 flex-shrink-0">
              {/* Self */}
              <div className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/50">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Self Audit (PIC Gudang)
                </span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-xl font-extrabold text-slate-900">
                    {summary.self_score !== null ? summary.self_score.toFixed(2) : '-'}
                  </span>
                  <span className="text-[10px] text-slate-400">/ 5.00</span>
                </div>
                <span className="text-[10px] font-bold text-emerald-600 block mt-0.5">
                  {summary.self_category || 'Kategori Standar'}
                </span>
              </div>

              {/* Official */}
              <div className="p-2.5 rounded-xl border border-blue-200 bg-blue-50/40">
                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">
                  Official Audit (Auditor)
                </span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-xl font-extrabold text-blue-600">
                    {summary.official_score !== null ? summary.official_score.toFixed(2) : '-'}
                  </span>
                  <span className="text-[10px] text-slate-400">/ 5.00</span>
                </div>
                <span className="text-[10px] font-bold text-blue-700 block mt-0.5">
                  {summary.official_category || 'Kategori Standar'}
                </span>
              </div>

              {/* Gap */}
              <div className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/50">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Selisih Gap Nilai (Official - Self)
                </span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className={`text-xl font-extrabold ${(summary.score_gap || 0) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {(summary.score_gap || 0) > 0 && '+'}
                    {summary.score_gap !== null ? summary.score_gap.toFixed(2) : '0.00'}
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 font-semibold block mt-0.5">
                  {summary.match_count} dari {summary.total_questions} Soal Cocok ({summary.mismatch_count} deviasi)
                </span>
              </div>
            </div>

            {/* 4 Gap Analytics Badges */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 flex-shrink-0 text-xs">
              <div className="p-2 rounded-lg border border-slate-200 bg-white">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                  Soal dengan Gap
                </span>
                <span className="text-sm font-black text-slate-800">
                  {questionsWithGap.length} Soal
                </span>
              </div>
              <div className="p-2 rounded-lg border border-slate-200 bg-white">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                  Pilihan Berbeda
                </span>
                <span className="text-sm font-black text-slate-800">
                  {questionsWithDifferentOptions.length} Soal
                </span>
              </div>
              <div className="p-2 rounded-lg border border-emerald-200 bg-emerald-50/30">
                <span className="text-[9px] font-bold text-emerald-700 uppercase tracking-wider block">
                  Gap Positif Terbesar
                </span>
                <span className="text-xs font-black text-emerald-800 truncate block">
                  {maxPositiveGap ? `+${maxPositiveGap.gap.toFixed(2)} (${maxPositiveGap.code})` : 'Tidak ada (+0.00)'}
                </span>
              </div>
              <div className="p-2 rounded-lg border border-rose-200 bg-rose-50/30">
                <span className="text-[9px] font-bold text-rose-700 uppercase tracking-wider block">
                  Gap Negatif Terbesar
                </span>
                <span className="text-xs font-black text-rose-800 truncate block">
                  {maxNegativeGap ? `${maxNegativeGap.gap.toFixed(2)} (${maxNegativeGap.code})` : 'Tidak ada (-0.00)'}
                </span>
              </div>
            </div>

            {/* Section Breakdown Grid */}
            <div className="flex-shrink-0">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Rincian Skor Per Seksi Standar Mutu
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {summary.section_comparisons.map((sec) => (
                  <div key={sec.section_id} className="p-2 rounded-lg border border-slate-200 bg-white flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-bold text-slate-900 block truncate max-w-[200px]">
                        {sec.section_title}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Self: {sec.self_score?.toFixed(1) || '-'} &bull; Official: {sec.official_score?.toFixed(1) || '-'}
                      </span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      (sec.gap || 0) < 0 ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-emerald-50 text-emerald-700'
                    }`}>
                      Gap {(sec.gap || 0) > 0 ? `+${sec.gap?.toFixed(1)}` : sec.gap?.toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Daftar Pertanyaan dengan Pilihan Jawaban Berbeda */}
            <div className="flex-1 min-h-0 border-t border-slate-100 pt-2">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Daftar Pertanyaan dengan Pilihan Jawaban Berbeda
                </span>
                <span className="text-[10px] font-bold text-slate-600">
                  {questionsWithDifferentOptions.length} Pertanyaan
                </span>
              </div>

              {questionsWithDifferentOptions.length === 0 ? (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-semibold flex items-center gap-2">
                  <span>✅</span>
                  <span>Seluruh 17 pilihan jawaban Self Audit dan Official Audit berkesesuaian 100% tanpa deviasi pilihan jawaban.</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {(summary.score_gap === 0 || Math.abs(summary.score_gap || 0) < 0.01) && (
                    <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 font-semibold">
                      ⚠️ <strong>Perhatian Mutu:</strong> Skor total kedua audit bernilai sama (Gap 0.00), namun terdapat {questionsWithDifferentOptions.length} pertanyaan dengan pilihan jawaban berbeda yang saling mengimbangi.
                    </div>
                  )}

                  <div className="space-y-1.5 max-h-48 overflow-y-auto qas-scroll pr-1">
                    {questionsWithDifferentOptions.map((q) => (
                      <div key={q.question_id} className="p-2 rounded-lg border border-slate-200 bg-slate-50/60 text-xs">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-mono font-bold text-blue-700 bg-white px-1.5 py-0.2 rounded border border-slate-200 text-[10px]">
                            {q.question_code}
                          </span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                            q.gap > 0 ? 'bg-emerald-50 text-emerald-700' : q.gap < 0 ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-700'
                          }`}>
                            Gap {q.gap > 0 ? `+${q.gap}` : q.gap}
                          </span>
                        </div>
                        <p className="text-[11px] font-semibold text-slate-800 mt-1 line-clamp-1">
                          {q.prompt}
                        </p>
                        <div className="grid grid-cols-2 gap-1.5 mt-1 text-[10px]">
                          <div className="p-1 rounded bg-white border border-slate-200 truncate">
                            <span className="text-slate-400 font-bold">Self:</span> {q.self_option_label || '-'} [{q.self_numeric_value ?? '-'}]
                          </div>
                          <div className="p-1 rounded bg-white border border-slate-200 truncate">
                            <span className="text-blue-600 font-bold">Official:</span> {q.official_option_label || '-'} [{q.official_numeric_value ?? '-'}]
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600 flex items-center justify-between flex-shrink-0">
              <span className="font-semibold text-slate-700">
                Snapshot Resmi Diterbitkan & Dikunci
              </span>
              <button
                onClick={() => setActiveTab('MATRIX')}
                className="text-blue-600 font-bold hover:underline"
              >
                Lihat Matriks Soal &rarr;
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: MATRIX WITH 1-SCREEN PAGINATION */}
        {activeTab === 'MATRIX' && (
          <div className="h-full flex flex-col justify-between overflow-hidden">
            {/* Filter Sub-header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-1.5 gap-1.5 flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-700">
                  Matriks 17 Pertanyaan
                </span>
                {/* OBS-03 Toggle: Hanya Gap > 0 */}
                <button
                  type="button"
                  onClick={() => {
                    setOnlyGap((prev) => !prev);
                    setQuestionPageIndex(0);
                  }}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all border flex items-center gap-1 cursor-pointer ${
                    onlyGap
                      ? 'bg-amber-500 text-white border-amber-600 shadow-2xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                  title="Filter hanya pertanyaan dengan selisih gap skor atau perbedaan pilihan jawaban"
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${onlyGap ? 'bg-white' : 'bg-slate-400'}`} />
                  <span>Hanya Gap &gt; 0</span>
                  <span className={`text-[9px] px-1 rounded-full font-mono ${
                    onlyGap ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {questionsWithGap.length}
                  </span>
                </button>
              </div>

              <div className="flex items-center gap-1 text-[10px]">
                <button
                  onClick={() => { setFilterMode('ALL'); setQuestionPageIndex(0); }}
                  className={`px-2 py-0.5 rounded ${filterMode === 'ALL' ? 'bg-blue-600 text-white font-bold' : 'text-slate-600'}`}
                >
                  Semua ({summary.total_questions})
                </button>
                <button
                  onClick={() => { setFilterMode('MISMATCH'); setQuestionPageIndex(0); }}
                  className={`px-2 py-0.5 rounded ${filterMode === 'MISMATCH' ? 'bg-red-600 text-white font-bold' : 'text-slate-600'}`}
                >
                  Berbeda ({summary.mismatch_count})
                </button>
                <button
                  onClick={() => { setFilterMode('MATCH'); setQuestionPageIndex(0); }}
                  className={`px-2 py-0.5 rounded ${filterMode === 'MATCH' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-600'}`}
                >
                  Cocok ({summary.match_count})
                </button>
              </div>
            </div>

            {/* Questions Page (2 items per page for 1-screen fit) */}
            <div className="my-auto py-1 space-y-2 flex-1 flex flex-col justify-around">
              {pageQuestions.map((q) => {
                const isMatch = q.status === 'MATCH';
                return (
                  <div
                    key={q.question_id}
                    className={`p-2.5 rounded-xl border text-xs ${
                      isMatch ? 'border-slate-200 bg-white' : 'border-red-200 bg-red-50/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-1">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="px-1.5 py-0.2 bg-blue-600 text-white text-[10px] font-mono font-bold rounded">
                            {q.question_code}
                          </span>
                          <span className="text-[10px] text-slate-400 font-bold">{q.section_code}</span>
                        </div>
                        <p className="text-[11px] font-semibold text-slate-800 mt-0.5 line-clamp-1">
                          {q.prompt}
                        </p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0 ${
                        isMatch ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600 border border-red-200'
                      }`}>
                        {isMatch ? 'Cocok' : `Selisih: ${q.gap > 0 ? `+${q.gap}` : q.gap}`}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1.5 text-[10px]">
                      <div className="p-1.5 rounded-lg bg-slate-50 border border-slate-200">
                        <span className="font-bold text-slate-400 block uppercase">Self Audit:</span>
                        <div className="font-extrabold text-slate-900 truncate mt-0.5">
                          {q.self_option_label || 'Belum Dijawab'}
                        </div>
                        <span className="text-slate-400 block mt-0.5">Nilai: {q.self_numeric_value ?? '-'}</span>
                      </div>
                      <div className="p-1.5 rounded-lg bg-blue-50/70 border border-blue-200">
                        <span className="font-bold text-blue-600 block uppercase">Official Audit:</span>
                        <div className="font-extrabold text-blue-900 truncate mt-0.5">
                          {q.official_option_label || 'Belum Dinilai'}
                        </div>
                        <span className="text-blue-600 block mt-0.5">Nilai: {q.official_numeric_value ?? '-'}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Controls */}
            <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between text-xs flex-shrink-0">
              <span className="text-[10px] text-slate-400">
                Halaman {questionPageIndex + 1} dari {totalQuestionPages}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  disabled={questionPageIndex === 0}
                  onClick={() => setQuestionPageIndex((p) => Math.max(0, p - 1))}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-40 text-xs font-bold"
                >
                  &larr; Sebelumnya
                </button>
                <button
                  disabled={questionPageIndex >= totalQuestionPages - 1}
                  onClick={() => setQuestionPageIndex((p) => Math.min(totalQuestionPages - 1, p + 1))}
                  className="px-2.5 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 text-xs font-bold"
                >
                  Berikutnya &rarr;
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: ACKNOWLEDGEMENT & AUDIT TRAIL */}
        {activeTab === 'ACK' && (
          <div className="h-full flex flex-col justify-between overflow-hidden gap-2">
            <div className="space-y-2 flex-shrink-0">
              <h3 className="text-xs sm:text-sm font-extrabold text-slate-900">
                Pengesahan Berita Acara & Jejak Audit
              </h3>

              {data.acknowledgement ? (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-emerald-700 bg-white px-1 rounded border border-emerald-200">
                      SAH
                    </span>
                    <span className="font-bold text-emerald-900">
                      Telah Dikonfirmasi oleh {data.acknowledgement.user_name}
                    </span>
                  </div>
                  <p className="text-[10px] text-emerald-700">
                    Pada {new Date(data.acknowledgement.acknowledged_at).toLocaleString('id-ID')}
                  </p>
                  {data.acknowledgement.note && (
                    <p className="text-[11px] text-slate-700 bg-white/80 p-2 rounded mt-1 border border-emerald-100">
                      <strong>Komitmen PIC:</strong> {data.acknowledgement.note}
                    </p>
                  )}
                </div>
              ) : (
                <form onSubmit={handleAcknowledge} className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                  <label className="block text-[11px] font-bold text-slate-700">
                    Catatan Komitmen PIC ({userRole}) - Opsional:
                  </label>
                  <input
                    type="text"
                    value={ackNote}
                    onChange={(e) => setAckNote(e.target.value)}
                    placeholder="Contoh: Temuan deviasi di area staging akan kami rapikan dalam 2 hari..."
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs"
                  />
                  <button
                    type="submit"
                    disabled={submittingAck}
                    className="px-4 py-1.5 bg-blue-600 text-white font-bold rounded-lg text-xs hover:bg-blue-700 shadow-xs"
                  >
                    {submittingAck ? 'Menyimpan...' : 'Tandatangani Berita Acara &rarr;'}
                  </button>
                </form>
              )}
            </div>

            {/* Audit Trail Log */}
            <div className="flex-1 flex flex-col justify-between min-h-0 border-t border-slate-100 pt-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Jejak Audit Sistem (Audit Trail)
              </span>
              <div className="space-y-1.5 overflow-hidden">
                {auditEvents.slice(0, 3).map((evt) => (
                  <div key={evt.id} className="p-2 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between text-[10px]">
                    <div className="flex items-center gap-1.5">
                      <span className="px-1.5 py-0.2 rounded font-mono font-bold bg-white text-slate-700 border border-slate-200">
                        {evt.event_type}
                      </span>
                      <span className="text-slate-600">oleh <strong>{evt.actor_name || 'Sistem'}</strong></span>
                    </div>
                    <span className="text-slate-400 font-mono">
                      {new Date(evt.created_at).toLocaleTimeString('id-ID')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
