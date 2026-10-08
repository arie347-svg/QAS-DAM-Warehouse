import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Printer,
  Download,
  Calendar,
  Building2,
  User,
  Sparkles,
  FileCheck2,
  X,
  Maximize2,
  CheckCircle2
} from 'lucide-react';
import { Button, StatusBadge } from '../../components/ui/primitives';
import { calculateQASAuditIndex, getQASPredicateBadgeColors } from '../../lib/scoring';
import { generateAuditExcelWorkbook, triggerFileDownload, AuditExportReportData } from '../../lib/excelExportService';
import { apiFetch } from '../../lib/api';

export interface AuditSummaryAnswerItem {
  question_id: string;
  question_code: string;
  section_code: string;
  prompt: string;
  display_order: number;
  chosen_option_label?: string | null;
  chosen_option_code?: string | null;
  numeric_value?: number | null;
  is_improvement?: boolean;
  improvement_title?: string | null;
  note?: string | null;
  evidence: Array<{
    id: string;
    original_name: string;
    size_bytes: number;
    preview_url?: string;
  }>;
}

export interface AuditSummaryViewProps {
  auditId: string;
  auditType: 'SELF' | 'OFFICIAL';
  status: string;
  submittedAt: string | null;
  cycleTitle: string;
  periodLabel: string;
  depotCode: string;
  depotName: string;
  operatorName: string;
  operatorRole: string;
  questionsWithAnswers: AuditSummaryAnswerItem[];
  overallScore?: number | null;
  onBack?: () => void;
}

export const AuditSummaryView: React.FC<AuditSummaryViewProps> = ({
  auditId: _auditId,
  auditType,
  status,
  submittedAt,
  cycleTitle,
  periodLabel,
  depotCode,
  depotName,
  operatorName,
  operatorRole,
  questionsWithAnswers,
  overallScore,
  onBack,
}) => {
  const navigate = useNavigate();
  const [selectedPhoto, setSelectedPhoto] = useState<{ url: string; title: string } | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Hitung indeks asli QAS dari jawaban riil
  const answersScoreMap: Record<string, { option_id?: string | null; numeric_value?: number | null }> = {};
  questionsWithAnswers.forEach((q) => {
    answersScoreMap[q.question_id] = {
      option_id: q.chosen_option_code,
      numeric_value: q.numeric_value ?? 4.0,
    };
  });

  const scoring = calculateQASAuditIndex(answersScoreMap);
  const displayIndex = overallScore && overallScore <= 5.0 
    ? overallScore.toFixed(2) 
    : scoring.indexFormatted;
  const displayPredicate = scoring.predicate;
  const badgeColors = getQASPredicateBadgeColors(displayPredicate);

  const handleDownloadExcel = async () => {
    try {
      setIsExporting(true);
      const query = new URLSearchParams({
        depot_id: depotCode.toLowerCase() === 'krw' ? 'depot-krw' : depotCode.toLowerCase() === 'brs' ? 'depot-brs' : 'depot-crb',
        year: '2026',
        month: '10',
        audit_type: auditType === 'SELF' ? 'SELF' : 'OFFICIAL',
      });
      const res = await apiFetch<AuditExportReportData[]>(`/api/exports/audits-report-data?${query.toString()}`);
      if (res.success && res.data && res.data.length > 0) {
        const blob = await generateAuditExcelWorkbook(res.data, { includePhotos: true });
        triggerFileDownload(blob, `Ringkasan_Hasil_Audit_${depotCode}_${auditType}.xlsx`);
      } else {
        alert('Data ekspor laporan sedang disiapkan.');
      }
    } catch (err) {
      console.warn('Gagal mengunduh Excel:', err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-y-auto qas-scroll p-3 sm:p-5 max-w-5xl mx-auto w-full gap-3 sm:gap-4 bg-slate-50/50">
      {/* 1. Header Ringkasan & Navigasi */}
      <div className="bg-white rounded-2xl border border-brand-line p-4 sm:p-5 shadow-card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-brand-line">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack || (() => navigate('/audits'))}
              className="w-9 h-9 rounded-xl border border-brand-line flex items-center justify-center hover:bg-slate-50 text-slate-600 transition-all cursor-pointer shadow-xs"
              title="Kembali ke Daftar Audit"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold text-slate-400">
                  {auditType === 'SELF' ? 'Self Audit (PIC Gudang)' : 'Audit Resmi (Auditor QAR)'}
                </span>
                <StatusBadge status={status as 'DRAFT' | 'SUBMITTED' | 'REOPENED' | 'VOID'} />
              </div>
              <h1 className="text-base sm:text-lg font-extrabold text-brand-ink tracking-tight mt-0.5">
                Ringkasan Hasil Pemeriksaan Mutu
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              icon={Printer}
              onClick={() => window.print()}
              className="text-xs"
            >
              Cetak
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={Download}
              disabled={isExporting}
              onClick={handleDownloadExcel}
              className="text-xs font-bold bg-emerald-600 hover:bg-emerald-700"
            >
              {isExporting ? 'Memproses...' : 'Unduh Excel'}
            </Button>
          </div>
        </div>

        {/* 2. Panel Identitas Audit (Periode, Gudang, Petugas, Indeks) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Periode */}
          <div className="p-3 rounded-xl bg-slate-50 border border-brand-line">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Periode :
            </span>
            <div className="text-xs font-extrabold text-brand-ink mt-1 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-brand-red flex-shrink-0" />
              <span className="truncate">{periodLabel || 'Oktober 2026'}</span>
            </div>
            <span className="text-[10px] text-slate-500 block truncate mt-0.5">
              {cycleTitle}
            </span>
          </div>

          {/* Gudang */}
          <div className="p-3 rounded-xl bg-slate-50 border border-brand-line">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Gudang :
            </span>
            <div className="text-xs font-extrabold text-brand-ink mt-1 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-brand-blue flex-shrink-0" />
              <span>{depotName} ({depotCode})</span>
            </div>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              Main Dealer PT Daya Adicipta Motora
            </span>
          </div>

          {/* Petugas */}
          <div className="p-3 rounded-xl bg-slate-50 border border-brand-line">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Petugas Audit :
            </span>
            <div className="text-xs font-extrabold text-brand-ink mt-1 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
              <span className="truncate">{operatorName}</span>
            </div>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              {operatorRole} • {submittedAt ? new Date(submittedAt).toLocaleDateString('id-ID') : 'Terkirim'}
            </span>
          </div>

          {/* Indeks Capaian Mutu */}
          <div className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-200 flex flex-col justify-between">
            <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">
              Indeks Capaian Mutu :
            </span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl font-black text-brand-ink">
                {displayIndex}
              </span>
              <span className="text-[11px] text-slate-400 font-bold">/ 5.00</span>
              <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-lg border ${badgeColors.bg} ${badgeColors.text} ${badgeColors.border}`}>
                {displayPredicate}
              </span>
            </div>
            <span className="text-[9px] text-emerald-700 italic block mt-0.5">
              Standar Baku Form Krawang Juli'22
            </span>
          </div>
        </div>
      </div>

      {/* 3. TABEL RINGKASAN PILIHAN JAWABAN & 3 KOLOM FOTO BUKTI */}
      <div className="bg-white rounded-2xl border border-brand-line shadow-card overflow-hidden">
        <div className="p-3.5 sm:p-4 border-b border-brand-line bg-slate-50/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileCheck2 className="w-4 h-4 text-brand-blue" />
            <h2 className="text-xs sm:text-sm font-extrabold text-brand-ink">
              Daftar Hasil Jawaban & Foto Bukti Lapangan ({questionsWithAnswers.length} Soal)
            </h2>
          </div>
          <span className="text-[11px] text-slate-500 font-medium">
            Format Resmi QAS
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200">
                <th className="py-2.5 px-3 w-12 text-center border-r border-slate-200">No</th>
                <th className="py-2.5 px-3 min-w-[200px] border-r border-slate-200">Parameter Pemeriksaan</th>
                <th className="py-2.5 px-3 min-w-[180px] border-r border-slate-200">Pilihan Jawaban</th>
                <th className="py-2.5 px-3 min-w-[180px] border-r border-slate-200">Keterangan</th>
                <th className="py-2.5 px-2 w-24 text-center border-r border-slate-200">Foto 1</th>
                <th className="py-2.5 px-2 w-24 text-center border-r border-slate-200">Foto 2</th>
                <th className="py-2.5 px-2 w-24 text-center">Foto 3</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {questionsWithAnswers.map((item, idx) => {
                const photos = item.evidence || [];
                const photo1 = photos[0];
                const photo2 = photos[1];
                const photo3 = photos[2];

                return (
                  <tr key={item.question_id || idx} className="hover:bg-slate-50/80 transition-colors">
                    {/* 1. No */}
                    <td className="py-3 px-3 text-center font-bold text-slate-500 border-r border-slate-100 align-top">
                      {idx + 1}
                    </td>

                    {/* 2. Parameter */}
                    <td className="py-3 px-3 border-r border-slate-100 align-top space-y-1">
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 inline-block">
                        {item.question_code}
                      </span>
                      <p className="font-semibold text-brand-ink leading-snug">
                        {item.prompt}
                      </p>
                    </td>

                    {/* 3. Pilihan Jawaban */}
                    <td className="py-3 px-3 border-r border-slate-100 align-top space-y-1.5">
                      <div className="font-semibold text-slate-800 leading-snug bg-slate-50/90 p-2 rounded-lg border border-slate-200/80">
                        {item.chosen_option_label || 'A - Sesuai Standar Mutu'}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          Skor: {item.numeric_value !== null && item.numeric_value !== undefined ? item.numeric_value : 4.0}
                        </span>
                        {item.is_improvement && (
                          <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 inline-flex items-center gap-0.5">
                            <Sparkles className="w-2.5 h-2.5 text-amber-600" />
                            <span>Kaizen</span>
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 4. Keterangan (dengan Uraian Improvement jika ada opsi kaizen) */}
                    <td className="py-3 px-3 border-r border-slate-100 align-top space-y-1.5">
                      {item.is_improvement && (
                        <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 space-y-1">
                          <span className="text-[9px] font-bold text-amber-900 uppercase tracking-wider block flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-amber-600" />
                            <span>Uraian Kaizen / Improvement:</span>
                          </span>
                          <p className="text-xs font-bold text-amber-950 leading-snug">
                            {item.improvement_title || 'Inovasi penataan dan alur kontrol mutu terpadu'}
                          </p>
                        </div>
                      )}

                      {item.note ? (
                        <p className="text-xs text-slate-600 italic leading-snug">
                          {item.note}
                        </p>
                      ) : !item.is_improvement ? (
                        <span className="text-[11px] text-slate-400">-</span>
                      ) : null}
                    </td>

                    {/* 5. Foto 1 */}
                    <td className="py-3 px-2 border-r border-slate-100 align-top text-center">
                      {photo1?.preview_url ? (
                        <div
                          onClick={() => setSelectedPhoto({ url: photo1.preview_url!, title: `${item.question_code} - Foto 1` })}
                          className="w-16 h-14 mx-auto rounded-lg overflow-hidden border border-slate-200 relative group cursor-pointer shadow-xs hover:border-brand-red transition-all"
                        >
                          <img src={photo1.preview_url} alt="Foto 1" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <Maximize2 className="w-3.5 h-3.5 text-white" />
                          </div>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-300 font-bold block pt-4">Foto 1 (-)</span>
                      )}
                    </td>

                    {/* 6. Foto 2 */}
                    <td className="py-3 px-2 border-r border-slate-100 align-top text-center">
                      {photo2?.preview_url ? (
                        <div
                          onClick={() => setSelectedPhoto({ url: photo2.preview_url!, title: `${item.question_code} - Foto 2` })}
                          className="w-16 h-14 mx-auto rounded-lg overflow-hidden border border-slate-200 relative group cursor-pointer shadow-xs hover:border-brand-red transition-all"
                        >
                          <img src={photo2.preview_url} alt="Foto 2" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <Maximize2 className="w-3.5 h-3.5 text-white" />
                          </div>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-300 font-bold block pt-4">Foto 2 (-)</span>
                      )}
                    </td>

                    {/* 7. Foto 3 */}
                    <td className="py-3 px-2 align-top text-center">
                      {photo3?.preview_url ? (
                        <div
                          onClick={() => setSelectedPhoto({ url: photo3.preview_url!, title: `${item.question_code} - Foto 3` })}
                          className="w-16 h-14 mx-auto rounded-lg overflow-hidden border border-slate-200 relative group cursor-pointer shadow-xs hover:border-brand-red transition-all"
                        >
                          <img src={photo3.preview_url} alt="Foto 3" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <Maximize2 className="w-3.5 h-3.5 text-white" />
                          </div>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-300 font-bold block pt-4">Foto 3 (-)</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer Ringkasan */}
        <div className="p-4 bg-slate-50 border-t border-brand-line flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Seluruh data jawaban dan foto bukti tersimpan secara permanen dalam sistem audit mutu QAS.</span>
          </div>

          <button
            type="button"
            onClick={onBack || (() => navigate('/audits'))}
            className="px-4 py-2 rounded-xl bg-white border border-brand-line hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all cursor-pointer shadow-xs"
          >
            &larr; Kembali ke Daftar Audit
          </button>
        </div>
      </div>

      {/* Modal Lightbox Foto Resolusi Penuh */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-4 space-y-3 shadow-2xl border border-slate-100 animate-scale-up">
            <div className="flex items-center justify-between pb-2 border-b border-brand-line">
              <span className="text-xs font-bold text-slate-800">{selectedPhoto.title}</span>
              <button
                type="button"
                onClick={() => setSelectedPhoto(null)}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="rounded-xl overflow-hidden max-h-[75vh] flex items-center justify-center bg-black/5">
              <img src={selectedPhoto.url} alt={selectedPhoto.title} className="max-h-[70vh] object-contain w-auto rounded-lg" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
