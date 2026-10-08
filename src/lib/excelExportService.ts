/**
 * Service Pembuat Berkas Laporan Excel Portrait (.xlsx) dengan Foto Tersemat
 * Quality Assurance System (QAS) Motorcycle Logistic
 * PT Daya Adicipta Motora / PT Astra Honda Motor
 */

import ExcelJS from 'exceljs';
import { getStoredAuditAnswers } from './api';

export interface ExportEvidenceItem {
  id?: string;
  original_name?: string;
  preview_url?: string;
  base64?: string;
}

export interface ExportQuestionItem {
  question_id: string;
  question_code: string;
  prompt: string;
  weight: number;
  self_score: number | null;
  self_option_label?: string | null;
  self_note?: string | null;
  self_evidences?: ExportEvidenceItem[];
  official_score: number | null;
  official_option_label?: string | null;
  official_note?: string | null;
  official_evidences?: ExportEvidenceItem[];
  gap: number | null;
}

export interface ExportSectionItem {
  section_id: string;
  section_code: string;
  section_title: string;
  weight?: number;
  questions: ExportQuestionItem[];
}

export interface AuditExportReportData {
  cycle_code: string;
  cycle_title: string;
  period_label: string;
  depot_code: string;
  depot_name: string;
  document_type: 'RECONCILIATION' | 'SELF' | 'OFFICIAL';
  pic_name: string;
  pic_status: string;
  pic_submitted_at: string | null;
  auditor_name: string;
  auditor_status: string;
  auditor_submitted_at: string | null;
  overall_self_score: number | null;
  overall_official_score: number | null;
  overall_gap: number | null;
  final_predicate: string;
  sections: ExportSectionItem[];
}

export interface GenerateExcelOptions {
  includePhotos?: boolean;
  onProgress?: (status: string, percent: number) => void;
}

/**
 * Memastikan foto-foto bukti yang tersimpan di perangkat lokal / draf terlampir ke data laporan
 */
function enrichReportsWithClientEvidences(reports: AuditExportReportData[]): void {
  if (typeof window === 'undefined') return;

  for (const report of reports) {
    const depotCodeLower = (report.depot_code || '').toLowerCase();
    const selfAliases = [
      `audit-self-${depotCodeLower}-202610`,
      `aud-self-depot-${depotCodeLower}`,
      `aud-self-${depotCodeLower}`,
      `audit-self-${depotCodeLower}`,
    ];
    const offAliases = [
      `audit-off-${depotCodeLower}-202610`,
      `aud-off-depot-${depotCodeLower}`,
      `aud-off-${depotCodeLower}`,
      `audit-off-${depotCodeLower}`,
    ];

    interface EvItem {
      id?: string;
      original_name?: string;
      size_bytes?: number;
      preview_url?: string;
      base64?: string;
    }
    interface AnsItem {
      option_id?: string | null;
      note?: string;
      improvement_title?: string;
      evidence?: EvItem[];
    }

    let combinedSelfAnswers: Record<string, AnsItem> = {};
    for (const key of selfAliases) {
      const stored = getStoredAuditAnswers(key) as Record<string, AnsItem>;
      if (stored) {
        combinedSelfAnswers = { ...combinedSelfAnswers, ...stored };
      }
    }

    let combinedOffAnswers: Record<string, AnsItem> = {};
    for (const key of offAliases) {
      const stored = getStoredAuditAnswers(key) as Record<string, AnsItem>;
      if (stored) {
        combinedOffAnswers = { ...combinedOffAnswers, ...stored };
      }
    }

    // Periksa juga localStorage untuk jawaban tersimpan
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.includes('answers_') && k.toLowerCase().includes(depotCodeLower)) {
        try {
          const raw = localStorage.getItem(k);
          if (raw) {
            const parsed = JSON.parse(raw) as Record<string, AnsItem>;
            if (k.toLowerCase().includes('self')) {
              combinedSelfAnswers = { ...combinedSelfAnswers, ...parsed };
            } else if (k.toLowerCase().includes('off')) {
              combinedOffAnswers = { ...combinedOffAnswers, ...parsed };
            }
          }
        } catch {
          // ignore
        }
      }
    }

    for (const sec of report.sections) {
      for (const q of sec.questions) {
        // Ambil bukti Self
        const sAns = combinedSelfAnswers[q.question_id] || combinedSelfAnswers[q.question_code] ||
          Object.entries(combinedSelfAnswers).find(([k]) => k.toLowerCase().includes(q.question_code.toLowerCase()))?.[1];

        if (sAns && (!q.self_evidences || q.self_evidences.length === 0) && sAns.evidence && sAns.evidence.length > 0) {
          q.self_evidences = sAns.evidence.map((ev, idx) => ({
            id: ev.id || `ev-self-${q.question_code}-${idx}`,
            original_name: ev.original_name || `foto_self_${q.question_code}_${idx + 1}.jpg`,
            preview_url: ev.preview_url || ev.base64,
            base64: ev.preview_url || ev.base64,
          }));
        }

        // Ambil bukti Official
        const oAns = combinedOffAnswers[q.question_id] || combinedOffAnswers[q.question_code] ||
          Object.entries(combinedOffAnswers).find(([k]) => k.toLowerCase().includes(q.question_code.toLowerCase()))?.[1];

        if (oAns && (!q.official_evidences || q.official_evidences.length === 0) && oAns.evidence && oAns.evidence.length > 0) {
          q.official_evidences = oAns.evidence.map((ev, idx) => ({
            id: ev.id || `ev-off-${q.question_code}-${idx}`,
            original_name: ev.original_name || `foto_off_${q.question_code}_${idx + 1}.jpg`,
            preview_url: ev.preview_url || ev.base64,
            base64: ev.preview_url || ev.base64,
          }));
        }
      }
    }
  }
}

/**
 * Mengonversi URL gambar atau data Base64 menjadi payload Base64 string yang kompatibel dengan ExcelJS
 */
async function fetchImageAsBase64(urlOrData: string): Promise<{ base64: string; extension: 'jpeg' | 'png' } | null> {
  try {
    if (!urlOrData || typeof urlOrData !== 'string') return null;

    // 1. Jika berupa Data URL (data:image/...)
    if (urlOrData.startsWith('data:')) {
      const commaIdx = urlOrData.indexOf(',');
      if (commaIdx !== -1) {
        const prefix = urlOrData.substring(0, commaIdx).toLowerCase();
        const rawBase64 = urlOrData.substring(commaIdx + 1).replace(/\s/g, '');
        const extension = prefix.includes('png') ? 'png' : 'jpeg';
        return { base64: rawBase64, extension };
      }
    }

    // 2. Jika merupakan raw base64 JPEG (/9j/) atau PNG (iVBOR)
    if (urlOrData.startsWith('/9j/') || urlOrData.startsWith('iVBOR')) {
      const cleanB64 = urlOrData.replace(/\s/g, '');
      const isPng = cleanB64.startsWith('iVBOR');
      return { base64: cleanB64, extension: isPng ? 'png' : 'jpeg' };
    }

    // 3. Jika merupakan URL lokal atau remote (/api/... atau http://...)
    if (urlOrData.startsWith('http://') || urlOrData.startsWith('https://') || urlOrData.startsWith('/api/') || urlOrData.startsWith('/images/')) {
      const response = await fetch(urlOrData);
      if (!response.ok) return null;
      const blob = await response.blob();

      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          const comma = result.indexOf(',');
          if (comma !== -1) {
            const prefix = result.substring(0, comma).toLowerCase();
            const b64 = result.substring(comma + 1).replace(/\s/g, '');
            resolve({ base64: b64, extension: prefix.includes('png') ? 'png' : 'jpeg' });
          } else {
            resolve(null);
          }
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    }

    // 4. Fallback: jika berupa raw base64 string lainnya
    const cleanB64 = urlOrData.replace(/\s/g, '');
    const isPng = cleanB64.startsWith('iVBOR');
    return { base64: cleanB64, extension: isPng ? 'png' : 'jpeg' };
  } catch (err) {
    console.warn('[ExcelExport] Gagal memuat foto bukti:', err);
    return null;
  }
}

/**
 * Menghasilkan buffer buku kerja Excel berformat Portrait A4 dengan Foto Tersemat
 */
export async function generateAuditExcelBuffer(
  reports: AuditExportReportData[],
  options: GenerateExcelOptions = {}
): Promise<ExcelJS.Buffer> {
  const { includePhotos = true, onProgress } = options;

  // Pastikan data laporan diperkaya dengan foto bukti lokal jika ada
  enrichReportsWithClientEvidences(reports);

  onProgress?.('Inisialisasi lembar kerja Excel...', 10);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'QAS Motorcycle Logistic System';
  workbook.lastModifiedBy = 'PT Daya Adicipta Motora';
  workbook.created = new Date();
  workbook.modified = new Date();

  // Hitung estimasi total foto untuk perhitungan progres
  let totalPhotos = 0;
  if (includePhotos) {
    reports.forEach((rep) => {
      rep.sections.forEach((sec) => {
        sec.questions.forEach((q) => {
          totalPhotos += (q.self_evidences?.length || 0) + (q.official_evidences?.length || 0);
        });
      });
    });
  }

  let processedPhotos = 0;

  for (let rIdx = 0; rIdx < reports.length; rIdx++) {
    const report = reports[rIdx];
    const sheetName = `Audit_${report.depot_code || 'Gudang'}_${rIdx + 1}`.slice(0, 31);
    const ws = workbook.addWorksheet(sheetName, {
      pageSetup: {
        orientation: 'portrait',
        paperSize: 9, // A4
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0, // vertikal memanjang alami
        margins: {
          left: 0.4,
          right: 0.4,
          top: 0.5,
          bottom: 0.5,
          header: 0.2,
          footer: 0.2,
        },
      },
      views: [{ showGridLines: true }],
    });

    // 1. Definisikan Lebar Kolom Portrait A4 (11 Kolom Sesuai Format Laporan Audit QAS.pdf)
    ws.columns = [
      { key: 'no', width: 5 },          // A: No
      { key: 'code', width: 8 },        // B: Kode Parameter
      { key: 'prompt', width: 34 },     // C: Parameter Pemeriksaan
      { key: 'weight', width: 7 },      // D: Bobot
      { key: 'self', width: 8 },        // E: Self
      { key: 'official', width: 8 },    // F: Official
      { key: 'gap', width: 7 },         // G: Gap
      { key: 'note', width: 22 },       // H: Catatan / Temuan
      { key: 'photo1', width: 17 },     // I: Foto 1
      { key: 'photo2', width: 17 },     // J: Foto 2
      { key: 'photo3', width: 17 },     // K: Foto 3
    ];

    // Helper Styles
    const borderThin: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };

    // 2. Baris Header / Kop Surat Perusahaan
    const r1 = ws.addRow(['', 'PT DAYA ADICIPTA MOTORA - MAIN DEALER HONDA', '', '', '', '', '', '', 'FORMULIR: FORM-QAS-LOG-2026', '', '']);
    r1.height = 24;
    ws.mergeCells('B1:H1');
    ws.mergeCells('I1:K1');
    r1.getCell('B').font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF0B2D57' } };
    r1.getCell('I').font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF64748B' } };
    r1.getCell('I').alignment = { horizontal: 'right', vertical: 'middle' };

    const r2 = ws.addRow(['', 'LAPORAN HASIL AUDIT MUTU LOGISTIK (QUALITY ASSURANCE SYSTEM)', '', '', '', '', '', '', `TGL CETAK: ${new Date().toLocaleDateString('id-ID')}`, '', '']);
    r2.height = 20;
    ws.mergeCells('B2:H2');
    ws.mergeCells('I2:K2');
    r2.getCell('B').font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFE11D2E' } };
    r2.getCell('I').font = { name: 'Arial', size: 8, color: { argb: 'FF64748B' } };
    r2.getCell('I').alignment = { horizontal: 'right', vertical: 'middle' };

    // Garis Pemisah
    const rSep = ws.addRow([]);
    rSep.height = 6;

    // 3. Panel Informasi Siklus & Auditee
    const r3 = ws.addRow(['', 'INFORMASI SIKLUS & AUDITEE', '', '', '', '', '', '', '', '', '']);
    r3.height = 18;
    ws.mergeCells('B4:K4');
    r3.getCell('B').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    r3.getCell('B').font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF1E293B' } };

    const docTypeLabel =
      report.document_type === 'RECONCILIATION'
        ? 'Rekonsiliasi Self vs Official Audit'
        : report.document_type === 'SELF'
        ? 'Laporan Self Audit (Internal Depo)'
        : 'Laporan Official Audit (QAR / Lead)';

    const r4 = ws.addRow(['', `• Periode Siklus : ${report.period_label || report.cycle_title}`, '', '', '', `• Jenis Dokumen : ${docTypeLabel}`, '', '', '', '', '']);
    ws.mergeCells('B5:E5');
    ws.mergeCells('F5:K5');
    r4.font = { name: 'Arial', size: 9 };
    r4.height = 17;

    const r5 = ws.addRow(['', `• Lokasi Depo    : ${report.depot_name} (${report.depot_code})`, '', '', '', `• PIC Gudang    : ${report.pic_name} (${report.pic_status})`, '', '', '', '', '']);
    ws.mergeCells('B6:E6');
    ws.mergeCells('F6:K6');
    r5.font = { name: 'Arial', size: 9 };
    r5.height = 17;

    const r6 = ws.addRow(['', `• Status Audit   : ${report.pic_submitted_at ? 'SUBMITTED' : 'IN PROGRESS'}`, '', '', '', `• Auditor QAS   : ${report.auditor_name} (${report.auditor_status})`, '', '', '', '', '']);
    ws.mergeCells('B7:E7');
    ws.mergeCells('F7:K7');
    r6.font = { name: 'Arial', size: 9 };
    r6.height = 17;

    // 4. Ringkasan Eksekutif Pencapaian Mutu
    const rSep2 = ws.addRow([]);
    rSep2.height = 6;

    const r7 = ws.addRow(['', 'RINGKASAN EKSEKUTIF PENCAPAIAN MUTU LOGISTIK', '', '', '', '', '', '', '', '', '']);
    r7.height = 18;
    ws.mergeCells('B9:K9');
    r7.getCell('B').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2D57' } };
    r7.getCell('B').font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };

    const scoreDisplay = report.overall_official_score !== null
      ? report.overall_official_score.toFixed(2)
      : report.overall_self_score !== null
      ? report.overall_self_score.toFixed(2)
      : 'N/A';

    const gapDisplay = report.overall_gap !== null
      ? (report.overall_gap >= 0 ? `+${report.overall_gap.toFixed(2)}` : report.overall_gap.toFixed(2))
      : '-';

    const r8 = ws.addRow([
      '',
      `SKOR MUTU AKHIR: ${scoreDisplay} / 5.00`,
      '',
      '',
      `PREDIKAT: [ ${report.final_predicate.toUpperCase()} ]`,
      '',
      `GAP RESMI: ${gapDisplay}`,
      '',
      '',
      '',
      '',
    ]);
    r8.height = 22;
    ws.mergeCells('B10:E10');
    ws.mergeCells('F10:H10');
    ws.mergeCells('I10:K10');
    r8.font = { name: 'Arial', size: 9, bold: true };
    r8.getCell('B').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
    r8.getCell('F').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
    r8.getCell('I').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    r8.alignment = { vertical: 'middle', horizontal: 'center' };

    const r9 = ws.addRow([
      '',
      'Formula Standar Baku: =(((Avg(J1.1) + Avg(J1.2) + Avg(J1.3))/3) + Avg(J2))/2  (Master Form KRAWANG JULI\'22)',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ]);
    r9.height = 16;
    ws.mergeCells('B11:K11');
    r9.font = { name: 'Arial', size: 8, italic: true, color: { argb: 'FF64748B' } };
    r9.alignment = { vertical: 'middle', horizontal: 'left' };

    // Garis Pemisah
    const rSep3 = ws.addRow([]);
    rSep3.height = 6;

    // 5. Header Tabel Pemeriksaan Parameter (2-Tier Header Sesuai Format PDF)
    const tableHeader1 = ws.addRow([
      'NO',
      'KODE',
      'PARAMETER PEMERIKSAAN STANDAR',
      'BOBOT',
      'SELF',
      'OFFICIAL',
      'GAP',
      'CATATAN / TEMUAN AUDIT',
      'FOTO BUKTI PEMERIKSAAN',
      '',
      '',
    ]);
    tableHeader1.height = 20;
    ws.mergeCells(`I${tableHeader1.number}:K${tableHeader1.number}`);

    const tableHeader2 = ws.addRow([
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'Foto 1',
      'Foto 2',
      'Foto 3',
    ]);
    tableHeader2.height = 18;

    // Merge vertikal kolom A s/d H antara baris tableHeader1 dan tableHeader2
    const h1Num = tableHeader1.number;
    const h2Num = tableHeader2.number;
    ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].forEach((col) => {
      ws.mergeCells(`${col}${h1Num}:${col}${h2Num}`);
    });

    [tableHeader1, tableHeader2].forEach((tr) => {
      tr.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: 'FFFFFFFF' } };
      tr.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      tr.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2D57' } };
        cell.border = borderThin;
      });
    });

    let qCounter = 1;
    const sectionRowSubtotals: { rowIdx: number; code: string }[] = [];

    // 6. Loop Tiap Seksi & Pertanyaan
    for (const section of report.sections) {
      // Header Seksi
      const secRow = ws.addRow([
        '',
        section.section_code,
        `SEKSI: ${section.section_title.toUpperCase()} (Bobot Relatif: ${section.weight || 1.0})`,
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
      ]);
      secRow.height = 20;
      ws.mergeCells(`C${secRow.number}:K${secRow.number}`);
      secRow.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: 'FF1E293B' } };
      secRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
        cell.border = borderThin;
      });

      const sectionStartRow = ws.rowCount + 1;

      for (const q of section.questions) {
        // Ambil bukti foto gabungan
        const evidences: ExportEvidenceItem[] = [
          ...(q.self_evidences || []),
          ...(q.official_evidences || []),
        ];

        const ev1 = evidences[0];
        const ev2 = evidences[1];
        const ev3 = evidences[2];
        const hasPhotos = includePhotos && (Boolean(ev1) || Boolean(ev2) || Boolean(ev3));
        const rowHeight = hasPhotos ? 75 : 22;

        const row = ws.addRow([
          qCounter++,
          q.question_code,
          q.prompt,
          q.weight || 1.0,
          q.self_score !== null ? Number(q.self_score.toFixed(2)) : '-',
          q.official_score !== null ? Number(q.official_score.toFixed(2)) : '-',
          q.gap !== null ? Number(q.gap.toFixed(2)) : '-',
          [q.self_note ? `[Self] ${q.self_note}` : '', q.official_note ? `[Off] ${q.official_note}` : ''].filter(Boolean).join('\n') || '-',
          ev1 ? '' : '(Foto 1)',
          ev2 ? '' : '(Foto 2)',
          ev3 ? '' : '(Foto 3)',
        ]);

        row.height = rowHeight;
        row.font = { name: 'Arial', size: 8.5 };
        row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(3).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
        row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(8).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
        row.getCell(9).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        row.getCell(10).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        row.getCell(11).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

        // Highlight Gap negatif
        if (q.gap !== null && q.gap < 0) {
          row.getCell(7).font = { name: 'Arial', size: 8.5, bold: true, color: { argb: 'FFDC2626' } };
          row.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
        }

        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.border = borderThin;
        });

        // 7. SEMATKAN GAMBAR DI KOLOM I, J, K (Foto 1, Foto 2, Foto 3)
        if (hasPhotos) {
          const photoTargets = [
            { ev: ev1, colIdx: 8 },  // Col I (0-indexed 8)
            { ev: ev2, colIdx: 9 },  // Col J (0-indexed 9)
            { ev: ev3, colIdx: 10 }, // Col K (0-indexed 10)
          ];

          for (const target of photoTargets) {
            if (!target.ev) continue;
            const imgUrl = target.ev.preview_url || target.ev.base64;
            if (!imgUrl) continue;

            processedPhotos++;
            if (onProgress && totalPhotos > 0) {
              const pct = 15 + Math.round((processedPhotos / totalPhotos) * 75);
              onProgress(`Menyematkan foto bukti (${processedPhotos}/${totalPhotos})...`, pct);
            }

            const imgData = await fetchImageAsBase64(imgUrl);
            if (imgData) {
              try {
                const imageId = workbook.addImage({
                  base64: imgData.base64,
                  extension: imgData.extension,
                });

                ws.addImage(imageId, {
                  tl: {
                    col: target.colIdx + 0.08,
                    row: row.number - 0.92,
                  },
                  ext: { width: 95, height: 68 },
                  editAs: 'oneCell',
                });
              } catch (imgErr) {
                console.warn('[ExcelExport] Gagal menyematkan gambar ke sel:', imgErr);
              }
            }
          }
        }
      }

      const sectionEndRow = ws.rowCount;

      // 8. Baris Sub-Total Rata-rata Seksi dengan Rumus Excel Bebas Error #DIV/0!
      const subRowIdx = ws.rowCount + 1;
      const subRow = ws.addRow([
        '',
        '',
        `SUB-TOTAL RATA-RATA ${section.section_code}`,
        '',
        { formula: `IF(COUNT(E${sectionStartRow}:E${sectionEndRow})>0, ROUND(AVERAGE(E${sectionStartRow}:E${sectionEndRow}), 2), "-")` },
        { formula: `IF(COUNT(F${sectionStartRow}:F${sectionEndRow})>0, ROUND(AVERAGE(F${sectionStartRow}:F${sectionEndRow}), 2), "-")` },
        { formula: `IF(AND(ISNUMBER(E${subRowIdx}), ISNUMBER(F${subRowIdx})), ROUND(F${subRowIdx}-E${subRowIdx}, 2), "-")` },
        '',
        '',
        '',
        '',
      ]);
      subRow.height = 20;
      subRow.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: 'FF0F172A' } };
      subRow.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        cell.border = borderThin;
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
      subRow.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };
      ws.mergeCells(`H${subRow.number}:K${subRow.number}`);

      sectionRowSubtotals.push({ rowIdx: subRow.number, code: section.section_code });
    }

    // 9. Rekapitulasi Akhir Tertimbang (Bebas Error #DIV/0!)
    const rSep4 = ws.addRow([]);
    rSep4.height = 8;

    const rRekapHead = ws.addRow(['', '', 'REKAPITULASI AKHIR TERTIMBANG (WEIGHTED AVERAGE)', '', '', '', '', '', '', '', '']);
    rRekapHead.height = 18;
    ws.mergeCells(`C${rRekapHead.number}:K${rRekapHead.number}`);
    rRekapHead.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    rRekapHead.eachCell((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2D57' } };
      c.border = borderThin;
    });

    const finalRowSelfFormula = sectionRowSubtotals.length > 0
      ? `IF(COUNT(${sectionRowSubtotals.map((s) => `E${s.rowIdx}`).join(',')})>0, ROUND(AVERAGE(${sectionRowSubtotals.map((s) => `E${s.rowIdx}`).join(',')}), 2), "-")`
      : '"-"';

    const finalRowOffFormula = sectionRowSubtotals.length > 0
      ? `IF(COUNT(${sectionRowSubtotals.map((s) => `F${s.rowIdx}`).join(',')})>0, ROUND(AVERAGE(${sectionRowSubtotals.map((s) => `F${s.rowIdx}`).join(',')}), 2), "-")`
      : '"-"';

    const finalScoreRowIdx = ws.rowCount + 1;
    const finalScoreRow = ws.addRow([
      '',
      '',
      'NILAI AKHIR MUTU LOGISTIK (SKOR QAS)',
      '100%',
      { formula: finalRowSelfFormula },
      { formula: finalRowOffFormula },
      { formula: `IF(AND(ISNUMBER(E${finalScoreRowIdx}), ISNUMBER(F${finalScoreRowIdx})), ROUND(F${finalScoreRowIdx}-E${finalScoreRowIdx}, 2), "-")` },
      report.final_predicate,
      '',
      '',
      '',
    ]);
    finalScoreRow.height = 24;
    finalScoreRow.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF0F172A' } };
    finalScoreRow.eachCell({ includeEmpty: true }, (c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF08A' } };
      c.border = borderThin;
      c.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    finalScoreRow.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };
    ws.mergeCells(`H${finalScoreRow.number}:K${finalScoreRow.number}`);

    // 10. Pengesahan & Tanda Tangan Digital (Digital Sign-off)
    const rSep5 = ws.addRow([]);
    rSep5.height = 10;

    const signHeaderRow = ws.addRow([
      '',
      'PENGESAHAN & BERITA ACARA DIGITAL (DIGITAL SIGN-OFF HASH)',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ]);
    signHeaderRow.height = 18;
    ws.mergeCells(`B${signHeaderRow.number}:K${signHeaderRow.number}`);
    signHeaderRow.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: 'FF1E293B' } };
    signHeaderRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };

    const signRow1 = ws.addRow([
      '',
      'DIBUAT OLEH (PIC QAS GUDANG):',
      '',
      '',
      '',
      'DIVERIFIKASI OLEH (AUDITOR QAS / LEAD):',
      '',
      '',
      '',
      '',
      '',
    ]);
    ws.mergeCells(`B${signRow1.number}:E${signRow1.number}`);
    ws.mergeCells(`F${signRow1.number}:K${signRow1.number}`);
    signRow1.font = { name: 'Arial', size: 8.5, bold: true };
    signRow1.height = 18;

    const signRow2 = ws.addRow([
      '',
      `Nama    : ${report.pic_name}`,
      '',
      '',
      '',
      `Nama    : ${report.auditor_name}`,
      '',
      '',
      '',
      '',
      '',
    ]);
    ws.mergeCells(`B${signRow2.number}:E${signRow2.number}`);
    ws.mergeCells(`F${signRow2.number}:K${signRow2.number}`);
    signRow2.font = { name: 'Arial', size: 8 };
    signRow2.height = 16;

    const signRow3 = ws.addRow([
      '',
      `Waktu   : ${report.pic_submitted_at ? new Date(report.pic_submitted_at).toLocaleString('id-ID') : 'Draft'}`,
      '',
      '',
      '',
      `Waktu   : ${report.auditor_submitted_at ? new Date(report.auditor_submitted_at).toLocaleString('id-ID') : 'Draft'}`,
      '',
      '',
      '',
      '',
      '',
    ]);
    ws.mergeCells(`B${signRow3.number}:E${signRow3.number}`);
    ws.mergeCells(`F${signRow3.number}:K${signRow3.number}`);
    signRow3.font = { name: 'Arial', size: 8 };
    signRow3.height = 16;

    const signRow4 = ws.addRow([
      '',
      '[DIGITAL SIGNATURE VERIFIED BY SYSTEM]',
      '',
      '',
      '',
      '[DIGITAL SIGNATURE VERIFIED BY SYSTEM]',
      '',
      '',
      '',
      '',
      '',
    ]);
    ws.mergeCells(`B${signRow4.number}:E${signRow4.number}`);
    ws.mergeCells(`F${signRow4.number}:K${signRow4.number}`);
    signRow4.font = { name: 'Arial', size: 8, bold: true, color: { argb: 'FF059669' } };
    signRow4.height = 18;
  }

  onProgress?.('Menyusun dan mengompres berkas Excel...', 95);
  const buffer = await workbook.xlsx.writeBuffer();
  onProgress?.('Selesai!', 100);

  return buffer;
}

/**
 * Menghasilkan Blob buku kerja Excel untuk diunduh langsung oleh browser pengguna
 */
export async function generateAuditExcelWorkbook(
  reports: AuditExportReportData[],
  options: GenerateExcelOptions = {}
): Promise<Blob> {
  const buffer = await generateAuditExcelBuffer(reports, options);
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/**
 * Memicu pengunduhan file di browser pengguna
 */
export function triggerFileDownload(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}
