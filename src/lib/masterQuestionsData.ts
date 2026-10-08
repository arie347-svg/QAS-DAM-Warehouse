export interface NormalizedOption {
  id: string;
  code: string;
  label: string;
  numeric_value: number | null;
  display_order: number;
  is_na: boolean;
}

export interface NormalizedQuestion {
  id: string;
  section_id: string;
  section_code: string;
  section_title: string;
  code: string;
  prompt: string;
  display_order: number;
  is_required: boolean;
  evidence_required: boolean;
  options: NormalizedOption[];
}

export interface NormalizedSection {
  id: string;
  code: string;
  title: string;
  display_order: number;
  weight: number;
  questions: NormalizedQuestion[];
}

export const NORMALIZED_MASTER_QUESTIONS: NormalizedQuestion[] = [
  // --- J1 - AHM to MD (12 Soal) ---
  {
    id: 'q-j1-dis-01',
    section_id: 'sec-j1-dis',
    section_code: 'J1-DIS',
    section_title: 'J1 - AHM to MD',
    code: 'J1-01',
    prompt: 'Kontrol proses transportasi dari AHM ke Main Dealer',
    display_order: 1,
    is_required: true,
    evidence_required: true,
    options: [
      { id: 'opt-j1-dis-01-1', code: 'OPT-A', label: 'Dilakukan review ekspedisi rutin tiap periodik', numeric_value: 4.0, display_order: 1, is_na: false },
      { id: 'opt-j1-dis-01-2', code: 'OPT-B', label: 'Ekspedisi hanya direview setiap kali ada masalah, seperti NRFS tinggi, keterlambatan, dan sebagainya', numeric_value: 3.0, display_order: 2, is_na: false },
      { id: 'opt-j1-dis-01-3', code: 'OPT-C', label: 'Ekspedisi dikontrol oleh Head Office; Main Dealer tidak mengetahui proses kontrol', numeric_value: 2.0, display_order: 3, is_na: false },
      { id: 'opt-j1-dis-01-4', code: 'OPT-D', label: 'Tidak ada kontrol dari Main Dealer', numeric_value: 1.0, display_order: 4, is_na: false },
    ],
  },
  {
    id: 'q-j1-dis-02',
    section_id: 'sec-j1-dis',
    section_code: 'J1-DIS',
    section_title: 'J1 - AHM to MD',
    code: 'J1-02',
    prompt: 'Prosedur unloading dan kelengkapan dokumen shipping list',
    display_order: 2,
    is_required: true,
    evidence_required: true,
    options: [
      { id: 'opt-j1-dis-02-1', code: 'OPT-A', label: 'Proses unloading dilakukan sesuai prosedur lengkap dengan shipping list dan list accessory', numeric_value: 4.0, display_order: 1, is_na: false },
      { id: 'opt-j1-dis-02-2', code: 'OPT-B', label: 'Unit diturunkan sesuai prosedur tetapi dokumen shipping list dan accessory tidak lengkap', numeric_value: 3.0, display_order: 2, is_na: false },
      { id: 'opt-j1-dis-02-3', code: 'OPT-C', label: 'Unit diturunkan dengan proses yang berpotensi membahayakan unit dan dokumen lengkap', numeric_value: 2.0, display_order: 3, is_na: false },
      { id: 'opt-j1-dis-02-4', code: 'OPT-D', label: 'Ada improvement terkait proses unloading atau bongkar muat', numeric_value: 5.0, display_order: 4, is_na: false },
    ],
  },
  {
    id: 'q-j1-dis-03',
    section_id: 'sec-j1-dis',
    section_code: 'J1-DIS',
    section_title: 'J1 - AHM to MD',
    code: 'J1-03',
    prompt: 'Pemeriksaan unit motor (visual & kelengkapan part) saat masuk gudang',
    display_order: 3,
    is_required: true,
    evidence_required: true,
    options: [
      { id: 'opt-j1-dis-03-1', code: 'OPT-A', label: 'Dilakukan pengecekan visual dan kelengkapan ACC serta didokumentasikan', numeric_value: 4.0, display_order: 1, is_na: false },
      { id: 'opt-j1-dis-03-2', code: 'OPT-B', label: 'Dilakukan pengecekan unit secara visual dan kelengkapan ACC', numeric_value: 3.0, display_order: 2, is_na: false },
      { id: 'opt-j1-dis-03-3', code: 'OPT-C', label: 'Dilakukan pengecekan unit secara visual saja', numeric_value: 2.0, display_order: 3, is_na: false },
      { id: 'opt-j1-dis-03-4', code: 'OPT-D', label: 'Tidak dilakukan pengecekan', numeric_value: 1.0, display_order: 4, is_na: false },
    ],
  },
  {
    id: 'q-j1-nrfs-01',
    section_id: 'sec-j1-nrfs',
    section_code: 'J1-NRFS',
    section_title: 'J1 - AHM to MD',
    code: 'J1-04',
    prompt: 'Penanganan penemuan unit cacat/lecet akibat transportasi',
    display_order: 4,
    is_required: true,
    evidence_required: true,
    options: [
      { id: 'opt-j1-nrfs-01-1', code: 'OPT-A', label: 'Ada improvement terkait penanganan unit cacat atau lecet akibat transportasi', numeric_value: 5.0, display_order: 1, is_na: false },
      { id: 'opt-j1-nrfs-01-2', code: 'OPT-B', label: 'Lapor ke sopir atau deliveryman dan admin; unit ditempatkan di area khusus NRFS, diberi identifikasi, dicatat kerusakannya, dan dilaporkan ke Main Dealer', numeric_value: 4.0, display_order: 2, is_na: false },
      { id: 'opt-j1-nrfs-01-3', code: 'OPT-C', label: 'Lapor ke sopir atau deliveryman dan admin; unit cacat atau lecet disimpan di gudang sesuai tipe dan warna', numeric_value: 3.0, display_order: 3, is_na: false },
      { id: 'opt-j1-nrfs-01-4', code: 'OPT-D', label: 'Lapor ke sopir atau deliveryman dan admin; unit dikembalikan ke gudang Main Dealer untuk ditukar', numeric_value: 2.0, display_order: 4, is_na: false },
      { id: 'opt-j1-nrfs-01-5', code: 'OPT-E', label: 'Lapor ke sopir atau deliveryman dan admin; lanjut memeriksa unit lain tanpa tindakan pada unit cacat atau lecet', numeric_value: 1.0, display_order: 5, is_na: false },
    ],
  },
  {
    id: 'q-j1-nrfs-02',
    section_id: 'sec-j1-nrfs',
    section_code: 'J1-NRFS',
    section_title: 'J1 - AHM to MD',
    code: 'J1-05',
    prompt: 'Ketersediaan lokasi khusus unit lecet/cacat (NRFS) beridentifikasi',
    display_order: 5,
    is_required: true,
    evidence_required: true,
    options: [
      { id: 'opt-j1-nrfs-02-1', code: 'OPT-A', label: 'Ada lokasi khusus NRFS yang memiliki tanda atau identifikasi', numeric_value: 4.0, display_order: 1, is_na: false },
      { id: 'opt-j1-nrfs-02-2', code: 'OPT-B', label: 'Ada lokasi NRFS tetapi tidak ada tanda atau identifikasi', numeric_value: 3.0, display_order: 2, is_na: false },
      { id: 'opt-j1-nrfs-02-3', code: 'OPT-C', label: 'Tidak ada lokasi khusus NRFS atau bergabung dengan unit lain', numeric_value: 1.0, display_order: 3, is_na: false },
    ],
  },
  {
    id: 'q-j1-nrfs-03',
    section_id: 'sec-j1-nrfs',
    section_code: 'J1-NRFS',
    section_title: 'J1 - AHM to MD',
    code: 'J1-06',
    prompt: 'Ketersediaan dan kualifikasi training PIC repair unit NRFS (TTL 1-3)',
    display_order: 6,
    is_required: true,
    evidence_required: true,
    options: [
      { id: 'opt-j1-nrfs-03-1', code: 'OPT-A', label: 'Ada PIC repair yang sudah training TTL 3', numeric_value: 5.0, display_order: 1, is_na: false },
      { id: 'opt-j1-nrfs-03-2', code: 'OPT-B', label: 'Ada PIC repair yang sudah training minimal TTL 2', numeric_value: 4.0, display_order: 2, is_na: false },
      { id: 'opt-j1-nrfs-03-3', code: 'OPT-C', label: 'Ada PIC repair yang sudah training minimal TTL 1', numeric_value: 3.0, display_order: 3, is_na: false },
      { id: 'opt-j1-nrfs-03-4', code: 'OPT-D', label: 'Ada PIC repair tetapi belum training', numeric_value: 2.0, display_order: 4, is_na: false },
      { id: 'opt-j1-nrfs-03-5', code: 'OPT-E', label: 'Tidak ada PIC yang melakukan repair', numeric_value: 1.0, display_order: 5, is_na: false },
    ],
  },
  {
    id: 'q-j1-nrfs-04',
    section_id: 'sec-j1-nrfs',
    section_code: 'J1-NRFS',
    section_title: 'J1 - AHM to MD',
    code: 'J1-07',
    prompt: 'Prosedur penggantian part unit NRFS bila stock kosong',
    display_order: 7,
    is_required: true,
    evidence_required: true,
    options: [
      { id: 'opt-j1-nrfs-04-1', code: 'OPT-A', label: 'Urgent order ke AHM', numeric_value: 5.0, display_order: 1, is_na: false },
      { id: 'opt-j1-nrfs-04-2', code: 'OPT-B', label: 'Beli di H3 terdekat, part shop satelit, HEPS, atau AHASS terdekat', numeric_value: 4.0, display_order: 2, is_na: false },
      { id: 'opt-j1-nrfs-04-3', code: 'OPT-C', label: 'Membeli part di bengkel umum atau toko spare part umum', numeric_value: 1.0, display_order: 3, is_na: false },
    ],
  },
  {
    id: 'q-j1-nrfs-05',
    section_id: 'sec-j1-nrfs',
    section_code: 'J1-NRFS',
    section_title: 'J1 - AHM to MD',
    code: 'J1-08',
    prompt: 'Personel verifikator penyelesaian perbaikan unit NRFS',
    display_order: 8,
    is_required: true,
    evidence_required: true,
    options: [
      { id: 'opt-j1-nrfs-05-1', code: 'OPT-A', label: 'Mekanik lain dengan kompetensi setara atau lebih tinggi dari mekanik yang melakukan perbaikan', numeric_value: 4.0, display_order: 1, is_na: false },
      { id: 'opt-j1-nrfs-05-2', code: 'OPT-B', label: 'Mekanik yang memperbaiki unit itu sendiri dan sudah lulus minimal TTL 1', numeric_value: 3.0, display_order: 2, is_na: false },
      { id: 'opt-j1-nrfs-05-3', code: 'OPT-C', label: 'Kepala gudang yang sedang dalam pengajuan training TTL', numeric_value: 2.0, display_order: 3, is_na: false },
      { id: 'opt-j1-nrfs-05-4', code: 'OPT-D', label: 'Tidak ada; setelah diperbaiki unit otomatis masuk stok unit OK', numeric_value: 1.0, display_order: 4, is_na: false },
    ],
  },
  {
    id: 'q-j1-nrfs-06',
    section_id: 'sec-j1-nrfs',
    section_code: 'J1-NRFS',
    section_title: 'J1 - AHM to MD',
    code: 'J1-09',
    prompt: 'Monitoring penyelesaian dan order part unit NRFS ke AHM',
    display_order: 9,
    is_required: true,
    evidence_required: true,
    options: [
      { id: 'opt-j1-nrfs-06-1', code: 'OPT-A', label: 'Ada improvement terkait monitoring penyelesaian unit NRFS', numeric_value: 5.0, display_order: 1, is_na: false },
      { id: 'opt-j1-nrfs-06-2', code: 'OPT-B', label: 'Monitoring order part ke AHM secara berkala dan terdata', numeric_value: 4.0, display_order: 2, is_na: false },
      { id: 'opt-j1-nrfs-06-3', code: 'OPT-C', label: 'Menanyakan status kedatangan part ke AHM secara berkala tetapi tidak terdata', numeric_value: 2.0, display_order: 3, is_na: false },
      { id: 'opt-j1-nrfs-06-4', code: 'OPT-D', label: 'Tidak melakukan tindakan', numeric_value: 1.0, display_order: 4, is_na: false },
    ],
  },
  {
    id: 'q-j1-mnt-01',
    section_id: 'sec-j1-mnt',
    section_code: 'J1-MNT',
    section_title: 'J1 - AHM to MD',
    code: 'J1-10',
    prompt: 'Perawatan dan pengecekan unit di gudang berumur > 1 bulan',
    display_order: 10,
    is_required: true,
    evidence_required: true,
    options: [
      { id: 'opt-j1-mnt-01-1', code: 'OPT-A', label: 'Ada improvement terhadap aktivitas perawatan unit SMH di gudang', numeric_value: 5.0, display_order: 1, is_na: false },
      { id: 'opt-j1-mnt-01-2', code: 'OPT-B', label: 'Ada; pengecekan dan perawatan dilakukan rutin, terjadwal, dan terdokumentasi', numeric_value: 4.0, display_order: 2, is_na: false },
      { id: 'opt-j1-mnt-01-3', code: 'OPT-C', label: 'Tidak ada unit SMH di gudang yang berumur lebih dari satu bulan', numeric_value: 4.0, display_order: 3, is_na: false },
      { id: 'opt-j1-mnt-01-4', code: 'OPT-D', label: 'Ada; unit dibersihkan setiap hari tetapi tidak didokumentasikan', numeric_value: 3.0, display_order: 4, is_na: false },
      { id: 'opt-j1-mnt-01-5', code: 'OPT-E', label: 'Ada; pengecekan dan perawatan dilakukan tetapi tidak konsisten dan tidak terjadwal', numeric_value: 2.0, display_order: 5, is_na: false },
      { id: 'opt-j1-mnt-01-6', code: 'OPT-F', label: 'Ada tetapi tidak dilakukan pengecekan dan perawatan', numeric_value: 1.0, display_order: 6, is_na: false },
    ],
  },
  {
    id: 'q-j1-mnt-02',
    section_id: 'sec-j1-mnt',
    section_code: 'J1-MNT',
    section_title: 'J1 - AHM to MD',
    code: 'J1-11',
    prompt: 'Prosedur penanganan unit NG akibat penyimpanan/pemindahan gudang',
    display_order: 11,
    is_required: true,
    evidence_required: true,
    options: [
      { id: 'opt-j1-mnt-02-1', code: 'OPT-A', label: 'Ada improvement terhadap aktivitas penanganan unit cacat akibat penyimpanan', numeric_value: 5.0, display_order: 1, is_na: false },
      { id: 'opt-j1-mnt-02-2', code: 'OPT-B', label: 'Dipindahkan ke lokasi khusus, diberi identifikasi NRFS, dibuatkan laporan, dan dilaporkan kepada pihak berwenang', numeric_value: 4.0, display_order: 2, is_na: false },
      { id: 'opt-j1-mnt-02-3', code: 'OPT-C', label: 'Tidak pernah ditemukan unit NG di gudang unit dealer atau display', numeric_value: 4.0, display_order: 3, is_na: false },
      { id: 'opt-j1-mnt-02-4', code: 'OPT-D', label: 'Dipindahkan ke lokasi NRFS dan diberi identifikasi bagian yang cacat', numeric_value: 3.5, display_order: 4, is_na: false },
      { id: 'opt-j1-mnt-02-5', code: 'OPT-E', label: 'Langsung dilaporkan kepada pihak berwenang; unit tetap di lokasi semula', numeric_value: 3.0, display_order: 5, is_na: false },
      { id: 'opt-j1-mnt-02-6', code: 'OPT-F', label: 'Langsung diperbaiki sendiri oleh orang yang menemukan', numeric_value: 2.0, display_order: 6, is_na: false },
    ],
  },
  {
    id: 'q-j1-mnt-03',
    section_id: 'sec-j1-mnt',
    section_code: 'J1-MNT',
    section_title: 'J1 - AHM to MD',
    code: 'J1-12',
    prompt: 'Tindakan perbaikan terhadap akar penyebab unit NG akibat simpan',
    display_order: 12,
    is_required: true,
    evidence_required: true,
    options: [
      { id: 'opt-j1-mnt-03-1', code: 'OPT-A', label: 'Selalu ada tindakan perbaikan terhadap penyebab unit NG akibat simpan', numeric_value: 4.0, display_order: 1, is_na: false },
      { id: 'opt-j1-mnt-03-2', code: 'OPT-B', label: 'Tidak pernah ada kasus unit NG akibat simpan', numeric_value: 4.0, display_order: 2, is_na: false },
      { id: 'opt-j1-mnt-03-3', code: 'OPT-C', label: 'Ada rencana perbaikan tetapi belum dilaksanakan karena menunggu persetujuan', numeric_value: 2.0, display_order: 3, is_na: false },
      { id: 'opt-j1-mnt-03-4', code: 'OPT-D', label: 'Tidak ada tindakan karena penyebab unit NG tidak diketahui', numeric_value: 1.0, display_order: 4, is_na: false },
    ],
  },

  // --- J2 - MD to Dealer (5 Soal) ---
  {
    id: 'q-j2-dis-01',
    section_id: 'sec-j2-dis',
    section_code: 'J2-DIS',
    section_title: 'J2 - MD to Dealer',
    code: 'J2-01',
    prompt: 'Pemeriksaan kondisi dan umur battery penerimaan dari AHM',
    display_order: 13,
    is_required: true,
    evidence_required: true,
    options: [
      { id: 'opt-j2-dis-01-1', code: 'OPT-A', label: 'Ada improvement terhadap proses untuk memastikan battery yang diterima selalu dalam kondisi bagus', numeric_value: 5.0, display_order: 1, is_na: false },
      { id: 'opt-j2-dis-01-2', code: 'OPT-B', label: 'Melakukan pemeriksaan umur semua battery pada setiap penerimaan dari AHM', numeric_value: 4.0, display_order: 2, is_na: false },
      { id: 'opt-j2-dis-01-3', code: 'OPT-C', label: 'Mengirimkan memo, WhatsApp, atau pemberitahuan lisan kepada AHM agar mengirim battery terbaru', numeric_value: 2.0, display_order: 3, is_na: false },
      { id: 'opt-j2-dis-01-4', code: 'OPT-D', label: 'Tidak melakukan tindakan', numeric_value: 1.0, display_order: 4, is_na: false },
    ],
  },
  {
    id: 'q-j2-dis-02',
    section_id: 'sec-j2-dis',
    section_code: 'J2-DIS',
    section_title: 'J2 - MD to Dealer',
    code: 'J2-02',
    prompt: 'Implementasi sistem FIFO pengiriman unit SMH ke dealer',
    display_order: 14,
    is_required: true,
    evidence_required: true,
    options: [
      { id: 'opt-j2-dis-02-1', code: 'OPT-A', label: 'Ada improvement yang dilakukan terkait implementasi FIFO', numeric_value: 5.0, display_order: 1, is_na: false },
      { id: 'opt-j2-dis-02-2', code: 'OPT-B', label: 'Pengambilan sesuai database unit ready for sale', numeric_value: 4.0, display_order: 2, is_na: false },
      { id: 'opt-j2-dis-02-3', code: 'OPT-C', label: 'Pengambilan berdasarkan tag FIFO bulanan', numeric_value: 3.5, display_order: 3, is_na: false },
      { id: 'opt-j2-dis-02-4', code: 'OPT-D', label: 'Pengambilan berdasarkan posisi paling depan, belakang, kanan, atau kiri', numeric_value: 1.0, display_order: 4, is_na: false },
    ],
  },
  {
    id: 'q-j2-dis-03',
    section_id: 'sec-j2-dis',
    section_code: 'J2-DIS',
    section_title: 'J2 - MD to Dealer',
    code: 'J2-03',
    prompt: 'Ketersediaan & kelayakan peralatan pengikat unit armada (IK-LOG)',
    display_order: 15,
    is_required: true,
    evidence_required: true,
    options: [
      { id: 'opt-j2-dis-03-1', code: 'OPT-A', label: 'Ada improvement penggunaan peralatan pengikatan yang lebih baik dari prosedur', numeric_value: 5.0, display_order: 1, is_na: false },
      { id: 'opt-j2-dis-03-2', code: 'OPT-B', label: 'Bentuk, ukuran, dan jumlah peralatan pengikatan sesuai prosedur untuk setiap unit SMH', numeric_value: 4.0, display_order: 2, is_na: false },
      { id: 'opt-j2-dis-03-3', code: 'OPT-C', label: 'Hanya sebagian perlengkapan pengikatan yang sesuai prosedur', numeric_value: 3.0, display_order: 3, is_na: false },
      { id: 'opt-j2-dis-03-4', code: 'OPT-D', label: 'Bentuk, ukuran, dan jumlah peralatan pengikatan tidak sesuai prosedur untuk setiap unit SMH', numeric_value: 2.0, display_order: 4, is_na: false },
      { id: 'opt-j2-dis-03-5', code: 'OPT-E', label: 'Tidak memiliki perlengkapan pengikatan unit SMH', numeric_value: 1.0, display_order: 5, is_na: false },
    ],
  },
  {
    id: 'q-j2-dis-04',
    section_id: 'sec-j2-dis',
    section_code: 'J2-DIS',
    section_title: 'J2 - MD to Dealer',
    code: 'J2-04',
    prompt: 'Kesesuaian titik pengikatan unit dengan Quality Point IK-LOG',
    display_order: 16,
    is_required: true,
    evidence_required: true,
    options: [
      { id: 'opt-j2-dis-04-1', code: 'OPT-A', label: 'Ada improvement terhadap Quality Point pengikatan', numeric_value: 5.0, display_order: 1, is_na: false },
      { id: 'opt-j2-dis-04-2', code: 'OPT-B', label: 'Semua Quality Point telah sesuai prosedur atau instruksi kerja', numeric_value: 4.0, display_order: 2, is_na: false },
      { id: 'opt-j2-dis-04-3', code: 'OPT-C', label: 'Hanya sebagian Quality Point yang sesuai', numeric_value: 3.0, display_order: 3, is_na: false },
      { id: 'opt-j2-dis-04-4', code: 'OPT-D', label: 'Sebagian titik pengikatan tidak sesuai prosedur tetapi unit dijamin tidak mengalami penurunan kualitas saat diantar', numeric_value: 2.0, display_order: 4, is_na: false },
      { id: 'opt-j2-dis-04-5', code: 'OPT-E', label: 'Pengikatan dilakukan tetapi tidak sesuai Quality Point', numeric_value: 1.0, display_order: 5, is_na: false },
    ],
  },
  {
    id: 'q-j2-dis-05',
    section_id: 'sec-j2-dis',
    section_code: 'J2-DIS',
    section_title: 'J2 - MD to Dealer',
    code: 'J2-05',
    prompt: 'Ketersediaan PIC kompeten untuk inspeksi unit sebelum dikirim ke dealer',
    display_order: 17,
    is_required: true,
    evidence_required: true,
    options: [
      { id: 'opt-j2-dis-05-1', code: 'OPT-A', label: 'Menyediakan PIC kompeten yang bertugas khusus melakukan pengecekan fisik dan dokumen 100 persen', numeric_value: 5.0, display_order: 1, is_na: false },
      { id: 'opt-j2-dis-05-2', code: 'OPT-B', label: 'Menyediakan PIC kompeten untuk melakukan pengecekan fisik dan dokumen 100 persen', numeric_value: 4.0, display_order: 2, is_na: false },
      { id: 'opt-j2-dis-05-3', code: 'OPT-C', label: 'Menyediakan PIC kompeten untuk pengecekan fisik dan dokumen secara sampling', numeric_value: 3.0, display_order: 3, is_na: false },
      { id: 'opt-j2-dis-05-4', code: 'OPT-D', label: 'Setelah loading, unit langsung dikirim tanpa pemeriksaan', numeric_value: 1.0, display_order: 4, is_na: false },
    ],
  },
];

export const NORMALIZED_MASTER_SECTIONS: NormalizedSection[] = [
  {
    id: 'sec-j1-dis',
    code: 'J1-DIS',
    title: 'J1 - AHM to MD (Distribusi)',
    display_order: 1,
    weight: 0.25,
    questions: NORMALIZED_MASTER_QUESTIONS.filter((q) => q.section_code === 'J1-DIS'),
  },
  {
    id: 'sec-j1-nrfs',
    code: 'J1-NRFS',
    title: 'J1 - AHM to MD (NRFS)',
    display_order: 2,
    weight: 0.35,
    questions: NORMALIZED_MASTER_QUESTIONS.filter((q) => q.section_code === 'J1-NRFS'),
  },
  {
    id: 'sec-j1-mnt',
    code: 'J1-MNT',
    title: 'J1 - AHM to MD (Maintenance)',
    display_order: 3,
    weight: 0.20,
    questions: NORMALIZED_MASTER_QUESTIONS.filter((q) => q.section_code === 'J1-MNT'),
  },
  {
    id: 'sec-j2-dis',
    code: 'J2-DIS',
    title: 'J2 - MD to Dealer',
    display_order: 4,
    weight: 0.20,
    questions: NORMALIZED_MASTER_QUESTIONS.filter((q) => q.section_code === 'J2-DIS'),
  },
];
