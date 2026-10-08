/**
 * Modul Perhitungan Indeks Baku Mutu QAS (Quality Assurance System)
 * Sesuai Standar Form Master KRAWANG JULI'22 & Dokumen Resmi PT Daya Adicipta Motora:
 * Formula Standar Baku:
 * Indeks = (((Avg(J1.1) + Avg(J1.2) + Avg(J1.3)) / 3) + Avg(J2)) / 2
 *
 * Skala Indeks: 1.00 s/d 5.00
 * Skala Predikat Mutu Resmi QAS:
 * - >= 4.50 : Sangat Baik
 * - >= 3.75 : Baik
 * - >= 3.00 : Cukup (contoh: 3.64 = Cukup)
 * - < 3.00  : Perlu Perbaikan
 */

export interface QASScoringOutput {
  index: number;
  indexFormatted: string; // contoh: "3.64" atau "3,64"
  predicate: 'Sangat Baik' | 'Baik' | 'Cukup' | 'Perlu Perbaikan';
  predicateColor: {
    bg: string;
    text: string;
    border: string;
  };
  sectionAverages: Record<string, number | null>;
}

export function getQASPredicate(index: number): 'Sangat Baik' | 'Baik' | 'Cukup' | 'Perlu Perbaikan' {
  if (index >= 4.5) return 'Sangat Baik';
  if (index >= 3.75) return 'Baik';
  if (index >= 3.0) return 'Cukup';
  return 'Perlu Perbaikan';
}

export function getQASPredicateBadgeColors(predicate: string) {
  switch (predicate) {
    case 'Sangat Baik':
      return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' };
    case 'Baik':
      return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' };
    case 'Cukup':
      return { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' };
    default:
      return { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' };
  }
}

/**
 * Menghitung indeks baku QAS dari pemetaan nilai numerik jawaban (17 soal standar).
 * Mengelompokkan berdasarkan seksi J1-DIS, J1-NRFS, J1-MNT, dan J2-DIS.
 */
export function calculateQASAuditIndex(
  answersMap: Record<string, { option_id?: string | null; numeric_value?: number | null } | undefined>,
  questionSectionMap?: Record<string, string> // questionId/code -> 'J1-DIS' | 'J1-NRFS' | 'J1-MNT' | 'J2-DIS'
): QASScoringOutput {
  // Pengelompokan seksi default jika tidak disediakan
  const j1DisScores: number[] = [];
  const j1NrfsScores: number[] = [];
  const j1MntScores: number[] = [];
  const j2DisScores: number[] = [];
  const allScores: number[] = [];

  Object.entries(answersMap).forEach(([qKey, ans]) => {
    if (!ans || ans.numeric_value === undefined || ans.numeric_value === null) return;
    const val = Number(ans.numeric_value);
    if (isNaN(val) || val <= 0) return;

    allScores.push(val);
    const sec = questionSectionMap ? questionSectionMap[qKey] : undefined;

    // Deteksi seksi berdasarkan key atau kode
    const keyLower = qKey.toLowerCase();
    if (sec === 'J1-DIS' || keyLower.includes('j1-01') || keyLower.includes('j1-02') || keyLower.includes('j1-03') || keyLower.includes('j1-dis-01') || keyLower.includes('j1-dis-02') || keyLower.includes('j1-dis-03')) {
      j1DisScores.push(val);
    } else if (sec === 'J1-NRFS' || keyLower.includes('j1-04') || keyLower.includes('j1-05') || keyLower.includes('j1-06') || keyLower.includes('j1-07') || keyLower.includes('j1-08') || keyLower.includes('j1-09') || keyLower.includes('j1-nrfs')) {
      j1NrfsScores.push(val);
    } else if (sec === 'J1-MNT' || keyLower.includes('j1-10') || keyLower.includes('j1-11') || keyLower.includes('j1-12') || keyLower.includes('j1-mnt')) {
      j1MntScores.push(val);
    } else if (sec === 'J2-DIS' || keyLower.includes('j2-') || keyLower.includes('j2-dis')) {
      j2DisScores.push(val);
    } else {
      // Default pembagian berdasarkan urutan
      j1DisScores.push(val);
    }
  });

  const avg = (arr: number[]) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

  const avgJ1Dis = avg(j1DisScores);
  const avgJ1Nrfs = avg(j1NrfsScores);
  const avgJ1Mnt = avg(j1MntScores);
  const avgJ2Dis = avg(j2DisScores);

  let finalIndex = 0;

  // Jika semua seksi terisi sesuai rumus baku:
  // Indeks = (((Avg(J1.1) + Avg(J1.2) + Avg(J1.3)) / 3) + Avg(J2)) / 2
  const validJ1Avgs = [avgJ1Dis, avgJ1Nrfs, avgJ1Mnt].filter((x): x is number => x !== null);
  if (validJ1Avgs.length > 0 && avgJ2Dis !== null) {
    const avgJ1 = validJ1Avgs.reduce((a, b) => a + b, 0) / validJ1Avgs.length;
    finalIndex = (avgJ1 + avgJ2Dis) / 2;
  } else if (allScores.length > 0) {
    // Fallback rata-rata keseluruhan jika pengelompokan belum lengkap
    finalIndex = allScores.reduce((a, b) => a + b, 0) / allScores.length;
  } else {
    finalIndex = 0; // Default 0 jika belum ada yang dijawab
  }

  // Bulatkan 2 desimal
  const rounded = Number(finalIndex.toFixed(2));
  const predicate = rounded > 0 ? getQASPredicate(rounded) : ('Perlu Perbaikan' as const);

  return {
    index: rounded,
    indexFormatted: rounded > 0 ? rounded.toFixed(2) : '0',
    predicate,
    predicateColor: getQASPredicateBadgeColors(predicate),
    sectionAverages: {
      'J1-DIS': avgJ1Dis !== null ? Number(avgJ1Dis.toFixed(2)) : null,
      'J1-NRFS': avgJ1Nrfs !== null ? Number(avgJ1Nrfs.toFixed(2)) : null,
      'J1-MNT': avgJ1Mnt !== null ? Number(avgJ1Mnt.toFixed(2)) : null,
      'J2-DIS': avgJ2Dis !== null ? Number(avgJ2Dis.toFixed(2)) : null,
    },
  };
}
