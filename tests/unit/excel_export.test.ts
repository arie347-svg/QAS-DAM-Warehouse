// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import ExcelJS from 'exceljs';
import {
  generateAuditExcelWorkbook,
  generateAuditExcelBuffer,
  AuditExportReportData,
} from '../../src/lib/excelExportService';
import {
  apiFetch,
  setActiveDevUser,
} from '../../src/lib/api';

describe('Fitur Ekspor Laporan Excel Portrait dengan Foto Tersemat & RBAC Guard', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  const sampleReportData: AuditExportReportData = {
    cycle_code: 'CYC-2026-10',
    cycle_title: 'Siklus Oktober 2026 - Audit Bulanan Mutu Logistik',
    period_label: '01/10/2026 s/d 31/10/2026',
    depot_code: 'KRW',
    depot_name: 'Depo Gudang Karawang',
    document_type: 'RECONCILIATION',
    pic_name: 'Ari Imam Safari',
    pic_status: 'SUBMITTED',
    pic_submitted_at: '2026-10-14T15:30:00Z',
    auditor_name: 'Fachmi Herdiansyah',
    auditor_status: 'SUBMITTED',
    auditor_submitted_at: '2026-10-15T11:20:00Z',
    overall_self_score: 4.67,
    overall_official_score: 4.38,
    overall_gap: -0.29,
    final_predicate: 'Baik Sekali',
    sections: [
      {
        section_id: 'sec-01',
        section_code: 'J1.1',
        section_title: 'Transportasi & Unloading AHM ke MD',
        weight: 1.0,
        questions: [
          {
            question_id: 'q-01',
            question_code: 'P-01',
            prompt: 'Pemeriksaan dokumen surat jalan dan fisik unit saat unloading.',
            weight: 1.0,
            self_score: 5.0,
            self_option_label: 'A - Sangat Baik',
            self_note: 'Dokumen lengkap sesuai checklist.',
            self_evidences: [
              {
                id: 'ev-1',
                original_name: 'surat_jalan.jpg',
                // 1x1 transparent GIF or tiny base64 JPEG
                base64: '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
              },
            ],
            official_score: 4.0,
            official_option_label: 'B - Cukup',
            official_note: 'Waktu kedatangan terlambat 15 menit.',
            official_evidences: [],
            gap: -1.0,
          },
          {
            question_id: 'q-02',
            question_code: 'P-02',
            prompt: 'Kondisi fisik unit bebas dari lecet, penyok, dan cacat ekspedisi.',
            weight: 1.0,
            self_score: 4.0,
            self_option_label: 'B - Cukup',
            self_note: 'Unit mulus tidak ada lecet.',
            self_evidences: [],
            official_score: 4.0,
            official_option_label: 'B - Cukup',
            official_note: 'Sesuai standar unloading.',
            official_evidences: [],
            gap: 0.0,
          },
        ],
      },
    ],
  };

  it('1. Menghasilkan berkas Excel dengan orientasi Portrait A4 dan tata letak pas selebar halaman', async () => {
    const progressReports: { status: string; percent: number }[] = [];

    const blob = await generateAuditExcelWorkbook([sampleReportData], {
      includePhotos: false,
      onProgress: (status, percent) => {
        progressReports.push({ status, percent });
      },
    });

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(blob.size).toBeGreaterThan(1000);
    expect(progressReports.length).toBeGreaterThan(0);
    expect(progressReports[progressReports.length - 1].percent).toBe(100);

    // Baca buffer menggunakan ExcelJS untuk memverifikasi properti worksheet
    const buffer = await generateAuditExcelBuffer([sampleReportData], {
      includePhotos: false,
    });
    const loadedWb = new ExcelJS.Workbook();
    await loadedWb.xlsx.load(buffer);

    expect(loadedWb.worksheets.length).toBe(1);
    const ws = loadedWb.worksheets[0];
    expect(ws.name).toContain('Audit_KRW');

    // Verifikasi page setup portrait & A4
    expect(ws.pageSetup.orientation).toBe('portrait');
    expect(ws.pageSetup.paperSize).toBe(9); // 9 = A4 di Excel OpenXML
    expect(ws.pageSetup.fitToWidth).toBe(1);
    expect(ws.pageSetup.fitToHeight).toBe(0);

    // Verifikasi Kop Surat PT DAM & Judul Resmi
    const titleCell = ws.getCell('B1');
    expect(titleCell.value).toContain('PT DAYA ADICIPTA MOTORA');

    const subTitleCell = ws.getCell('B2');
    expect(subTitleCell.value).toContain('LAPORAN HASIL AUDIT MUTU LOGISTIK');
  });

  it('2. Berhasil menyematkan gambar foto bukti (embedded image) ke dalam sel baris pemeriksaan', async () => {
    const bufferWithPhotos = await generateAuditExcelBuffer([sampleReportData], {
      includePhotos: true,
    });

    const loadedWb = new ExcelJS.Workbook();
    await loadedWb.xlsx.load(bufferWithPhotos);

    const ws = loadedWb.worksheets[0];
    const images = ws.getImages();

    // Verifikasi setidaknya 1 gambar terpasang di worksheet
    expect(images.length).toBeGreaterThanOrEqual(1);

    // Verifikasi koordinat anchor gambar berada pada kolom ke-8 (Kolom I: Foto Bukti)
    const imgRef = images[0];
    const range = imgRef.range as unknown as { tl: { col: number; row: number } };
    expect(Math.floor(range.tl.col)).toBe(8); // Kolom I adalah index 8 (A=0, B=1, ..., I=8)
  });

  it('3. Menerapkan Server-Side Zero Client Trust: PIC Gudang Karawang DITOLAK saat meminta depo lain', async () => {
    // Set user aktif sebagai PIC Karawang (usr-001)
    setActiveDevUser('usr-001');

    // Coba minta data depo Baros ('depot-brs')
    const resForbidden = await apiFetch<AuditExportReportData[]>(
      '/api/exports/audits-report-data?depot_id=depot-brs&year=2026&month=10'
    );

    expect(resForbidden.success).toBe(false);
    expect(resForbidden.error?.code).toBe('FORBIDDEN_DEPOT_ACCESS');
    expect(resForbidden.error?.message).toContain('PIC QAS hanya berwenang');

    // Coba minta data 'all' (semua depo) sebagai PIC
    const resForbiddenAll = await apiFetch<AuditExportReportData[]>(
      '/api/exports/audits-report-data?depot_id=all&year=2026&month=10'
    );

    expect(resForbiddenAll.success).toBe(false);
    expect(resForbiddenAll.error?.code).toBe('FORBIDDEN_DEPOT_ACCESS');
  });

  it('4. Mengizinkan PIC Gudang Karawang mengunduh data deponya sendiri', async () => {
    setActiveDevUser('usr-001');

    const res = await apiFetch<AuditExportReportData[]>(
      '/api/exports/audits-report-data?depot_id=depot-krw&year=2026&month=10'
    );

    expect(res.success).toBe(true);
    expect(res.data).toBeDefined();
    expect(res.data?.length).toBe(1);
    expect(res.data?.[0].depot_code).toBe('KRW');
  });

  it('5. Mengizinkan Auditor QAS (QAR) dan Admin mengunduh Semua Depo (All) atau Depo Tertentu', async () => {
    // Set user aktif sebagai Auditor (usr-004)
    setActiveDevUser('usr-004');

    // Permintaan Semua Depo ('all')
    const resAll = await apiFetch<AuditExportReportData[]>(
      '/api/exports/audits-report-data?depot_id=all&year=2026&month=10'
    );

    expect(resAll.success).toBe(true);
    expect(resAll.data).toBeDefined();
    // Harus mengembalikan 3 depo (Karawang, Baros, Cirebon)
    expect(resAll.data?.length).toBe(3);
    const codes = resAll.data?.map((d) => d.depot_code);
    expect(codes).toContain('KRW');
    expect(codes).toContain('BRS');
    expect(codes).toContain('CRB');

    // Permintaan depo spesifik (Baros)
    const resBrs = await apiFetch<AuditExportReportData[]>(
      '/api/exports/audits-report-data?depot_id=depot-brs&year=2026&month=10'
    );
    expect(resBrs.success).toBe(true);
    expect(resBrs.data?.length).toBe(1);
    expect(resBrs.data?.[0].depot_code).toBe('BRS');
  });
});
