import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Download,
  Lock,
  Loader2,
  Calendar,
  Building2,
  Camera,
  Layers,
  Clock
} from 'lucide-react';
import {
  getActiveDevUser,
  getUserAssignedDepots,
  DEPOTS,
  apiFetch
} from '../../lib/api';
import type { AuditExportReportData } from '../../lib/excelExportService';

export const ReportsPage: React.FC = () => {
  // Role and Depot State
  const activeUser = getActiveDevUser();
  const isPic = activeUser.profile.primaryRole === 'PIC_QAS';
  const assignedDepots = getUserAssignedDepots(activeUser);

  // Export Filter States
  const currentYear = new Date().getFullYear().toString();
  const currentMonth = (new Date().getMonth() + 1).toString();

  const [selectedYear, setSelectedYear] = useState<string>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth);
  const [selectedDepot, setSelectedDepot] = useState<string>(
    isPic ? assignedDepots[0]?.id || 'depot-krw' : 'all'
  );
  const [selectedType, setSelectedType] = useState<'RECONCILIATION' | 'SELF' | 'OFFICIAL'>('RECONCILIATION');
  const [includePhotos, setIncludePhotos] = useState<boolean>(true);

  // Export Process States
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<{ status: string; percent: number }>({
    status: '',
    percent: 0,
  });
  const [exportError, setExportError] = useState<string | null>(null);
  const [downloadedFileInfo, setDownloadedFileInfo] = useState<{
    filename: string;
    timestamp: string;
    blob: Blob | null;
  } | null>(null);

  // Sync depot selection if active role switches in dev mode
  useEffect(() => {
    if (isPic) {
      setSelectedDepot(assignedDepots[0]?.id || 'depot-krw');
    }
  }, [isPic, assignedDepots]);

  const handleDownloadExcel = async () => {
    setIsExporting(true);
    setExportError(null);
    setDownloadedFileInfo(null);
    setExportProgress({ status: 'Menghubungkan ke server...', percent: 10 });

    try {
      const query = new URLSearchParams({
        year: selectedYear,
        month: selectedMonth,
        depot_id: selectedDepot,
        audit_type: selectedType,
      });

      setExportProgress({ status: 'Mengambil data audit dari database...', percent: 25 });

      const res = await apiFetch<AuditExportReportData[]>(`/api/exports/audits-report-data?${query.toString()}`);

      if (!res.success || !res.data || res.data.length === 0) {
        throw new Error(
          res.error?.message || 'Tidak ditemukan catatan audit untuk periode dan depo yang dipilih.'
        );
      }

      setExportProgress({ status: 'Menyiapkan berkas lembar kerja Excel...', percent: 45 });

      const { generateAuditExcelWorkbook, triggerFileDownload } = await import('../../lib/excelExportService');

      const blob = await generateAuditExcelWorkbook(res.data, {
        includePhotos,
        onProgress: (status, percent) => {
          setExportProgress({ status, percent });
        },
      });

      const depotSuffix = selectedDepot === 'all' ? 'SEMUA_DEPO' : (DEPOTS.find((d) => d.id === selectedDepot)?.code || selectedDepot);
      const filename = `Laporan_Audit_QAS_${depotSuffix}_${selectedYear}_Bulan${selectedMonth}.xlsx`;

      triggerFileDownload(blob, filename);
      setDownloadedFileInfo({
        filename,
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        blob,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setExportError(msg || 'Terjadi kesalahan saat memproses laporan Excel.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-y-auto qas-scroll p-3 sm:p-5 max-w-4xl mx-auto w-full">
      {/* Kartu Panel Ekspor Ringkas */}
      <div className="bg-white rounded-2xl border border-brand-line p-4 sm:p-6 shadow-card space-y-4">
        {/* Header Ringkas */}
        <div className="flex items-center gap-3 pb-3 border-b border-brand-line">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center flex-shrink-0 border border-emerald-100 shadow-xs">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-extrabold text-brand-ink">
              Ekspor Laporan Audit Excel
            </h1>
            <p className="text-xs text-brand-muted">
              Pilih filter periode dan depo untuk mengunduh berkas laporan format resmi
            </p>
          </div>
        </div>

        {/* 4 Filter: Tahun, Bulan, Depo, Jenis Dokumen */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* 1. Filter Tahun */}
          <div>
            <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5 mb-1.5">
              <Calendar className="w-3.5 h-3.5 text-brand-blue" />
              <span>Tahun</span>
            </label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full text-xs font-semibold bg-slate-50 border border-brand-line rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            >
              <option value="2026">2026</option>
              <option value="2025">2025</option>
              <option value="2024">2024</option>
            </select>
          </div>

          {/* 2. Filter Bulan */}
          <div>
            <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5 mb-1.5">
              <Clock className="w-3.5 h-3.5 text-brand-blue" />
              <span>Bulan</span>
            </label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full text-xs font-semibold bg-slate-50 border border-brand-line rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            >
              <option value="all">Semua Bulan</option>
              <option value="1">Januari</option>
              <option value="2">Februari</option>
              <option value="3">Maret</option>
              <option value="4">April</option>
              <option value="5">Mei</option>
              <option value="6">Juni</option>
              <option value="7">Juli</option>
              <option value="8">Agustus</option>
              <option value="9">September</option>
              <option value="10">Oktober</option>
              <option value="11">November</option>
              <option value="12">Desember</option>
            </select>
          </div>

          {/* 3. Filter Depo Gudang */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-brand-blue" />
                <span>Depo</span>
              </label>
              {isPic && (
                <span className="text-[10px] text-amber-700 font-bold flex items-center gap-0.5 bg-amber-50 px-1.5 py-0.5 rounded">
                  <Lock className="w-2.5 h-2.5" /> Terkunci
                </span>
              )}
            </div>
            <select
              value={selectedDepot}
              onChange={(e) => setSelectedDepot(e.target.value)}
              disabled={isPic}
              className={`w-full text-xs font-semibold border rounded-xl px-3 py-2 focus:outline-none transition-colors ${
                isPic
                  ? 'bg-slate-100 border-slate-300 text-slate-600 cursor-not-allowed'
                  : 'bg-slate-50 border-brand-line text-slate-800 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500'
              }`}
            >
              {!isPic && <option value="all">Semua Depo</option>}
              {DEPOTS.map((d) => (
                <option key={d.id} value={d.id}>
                  Depo {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* 4. Filter Jenis Dokumen */}
          <div>
            <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5 mb-1.5">
              <Layers className="w-3.5 h-3.5 text-brand-blue" />
              <span>Jenis Dokumen</span>
            </label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as 'RECONCILIATION' | 'SELF' | 'OFFICIAL')}
              className="w-full text-xs font-semibold bg-slate-50 border border-brand-line rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            >
              <option value="RECONCILIATION">Rekonsiliasi (Self vs QAR)</option>
              <option value="SELF">Self Audit PIC Saja</option>
              <option value="OFFICIAL">Official Audit QAR Saja</option>
            </select>
          </div>
        </div>

        {/* Checkbox Foto Bukti & Tombol Export */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 px-3 py-2 rounded-xl border border-slate-200 transition-colors">
            <input
              type="checkbox"
              checked={includePhotos}
              onChange={(e) => setIncludePhotos(e.target.checked)}
              className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
            />
            <Camera className="w-4 h-4 text-emerald-700" />
            <span>Sematkan Foto Bukti di Dalam Excel</span>
          </label>

          <button
            onClick={handleDownloadExcel}
            disabled={isExporting}
            className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs text-white shadow-sm transition-all min-h-[44px] ${
              isExporting
                ? 'bg-emerald-400 cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98]'
            }`}
          >
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Memproses ({exportProgress.percent}%)...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Unduh Laporan Excel (.xlsx)</span>
              </>
            )}
          </button>
        </div>

        {/* Progress Bar saat Ekspor Berjalan */}
        {isExporting && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-1.5 animate-fadeIn">
            <div className="flex items-center justify-between text-xs font-bold text-emerald-900">
              <span className="flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                <span>{exportProgress.status}</span>
              </span>
              <span>{exportProgress.percent}%</span>
            </div>
            <div className="w-full bg-emerald-200/60 rounded-full h-2 overflow-hidden">
              <div
                className="bg-emerald-600 h-full rounded-full transition-all duration-300"
                style={{ width: `${exportProgress.percent}%` }}
              />
            </div>
          </div>
        )}

        {/* File Berhasil Diunduh */}
        {downloadedFileInfo && (
          <div className="p-3.5 rounded-xl bg-emerald-50/80 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fadeIn">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center flex-shrink-0 shadow-xs">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-emerald-950 truncate">
                    {downloadedFileInfo.filename}
                  </span>
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Berhasil
                  </span>
                </div>
                <p className="text-[11px] text-emerald-700 mt-0.5">
                  Diunduh pada {downloadedFileInfo.timestamp}. Berkas siap dicetak atau diarsipkan.
                </p>
              </div>
            </div>

            {downloadedFileInfo.blob && (
              <button
                type="button"
                onClick={async () => {
                  if (downloadedFileInfo?.blob) {
                    const { triggerFileDownload } = await import('../../lib/excelExportService');
                    triggerFileDownload(downloadedFileInfo.blob, downloadedFileInfo.filename);
                  }
                }}
                className="self-end sm:self-auto px-3 py-1.5 rounded-lg border border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-800 text-xs font-bold inline-flex items-center gap-1.5 shadow-xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Unduh Ulang</span>
              </button>
            )}
          </div>
        )}

        {/* Pesan Error jika Gagal */}
        {exportError && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-medium animate-fadeIn">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
            <span>{exportError}</span>
          </div>
        )}
      </div>
    </div>
  );
};
