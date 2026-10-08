Tahap 1 — Autentikasi aplikasi

* Ganti alur Cloudflare Access pengguna menjadi login aplikasi.
* Login menggunakan email kantor dan password.
* Password awal sementara 12345.
* Wajib mengganti password sebelum dapat menggunakan aplikasi.
* Password disimpan dalam bentuk hash dan salt.
* Session menggunakan cookie HttpOnly, Secure, dan SameSite.
* Tambahkan rate limiting, account lock, dan audit trail.
* Remember Me mengatur masa aktif session.

Tahap 1 selesai di production



NEXT

Tahap 2 — Login dan instalasi PWA
Alur:

1. Pengguna membuka link.
2. Muncul popup:

   * Pasang Aplikasi
   * Lanjut di Browser
3. Instalasi menggunakan dialog native browser.
4. Setelah memasang atau melanjutkan di browser, tampil halaman login.
5. Login menggunakan email dan password.
6. Jika masih memakai password awal, tampil modal wajib ganti password.
Untuk iPhone/iOS, tampilkan petunjuk singkat Add to Home Screen karena instalasi langsung tidak didukung sistem.


Tahap 3 — Penyesuaian Cloudflare

* Halaman login, manifest, service worker, dan aset PWA harus dapat dimuat sebelum login.
* Seluruh API data tetap dilindungi session aplikasi.
* Cloudflare tetap digunakan untuk HTTPS, WAF, rate limiting, D1, R2, dan hosting.
* Kebijakan Access production baru diubah setelah autentikasi aplikasi lolos pengujian staging.


Tahap 4 — Dashboard

* Pindahkan tombol Mulai Audit.
* Saat belum ada audit yang disubmit:

  1. Tampilkan Belum ada riwayat audit yang disubmit.
  2. Letakkan tombol Mulai Audit tepat di bawah teks tersebut.
* Tombol dibuat lebar dan mudah ditekan pada handphone.


Tahap 5 — Halaman Audit
Urutan tampilan:

1. Filter bulan.
2. Panel pilihan depo.
3. Kartu Self Audit dan Audit Resmi.
Panel depo:
* Satu depo: hanya satu pilihan aktif.
* Beberapa depo: tampilkan tab untuk berpindah depo.
* Data dimuat ulang dari D1 setelah depo berpindah.
* Data antar-depo tidak boleh tercampur.
Kartu audit:
* Berada di tengah area layar.
* Lebih tinggi dan terlihat timbul.
* Informasi tetap ringkas.
* Tombol hapus dihilangkan.


Tahap 6 — Ringkasan formulir audit
Header halaman dihilangkan. Bagian atas hanya menampilkan:

* Progres
* Index
Di bawahnya terdapat daftar soal:
* Header tabel tetap.
* Hanya daftar soal yang dapat di-scroll.
* Tidak ada scroll horizontal.
* Optimal pada lebar 360 px.
* Uraian pertanyaan maksimal dua baris.
* Thumbnail foto pertama.
* Ikon redup jika belum lengkap.
* Checklist hijau jika jawaban dan bukti wajib sudah lengkap.


Tahap 7 — Detail pertanyaan dan foto
Aturan:

* Akses Internal aktif: pengguna dapat memilih foto dari penyimpanan.
* Akses Internal tidak aktif: hanya kamera.
* Wajib Foto aktif: jawaban belum lengkap tanpa foto.
* Tombol kamera dan galeri dibuat terpisah dan jelas.
Perbaikan bug foto:
* State modal dibuat berdasarkan questionId.
* State foto dibersihkan sebelum membuka soal lain.
* Foto dimuat hanya dari jawaban soal yang sedang dibuka.
* Upload dikaitkan dengan auditId, questionId, dan answerId.
* URL preview dibersihkan saat modal ditutup.
* Thumbnail ringkasan mengambil foto dari soal yang sama.


Tahap 8 — Sinkronisasi Master Soal
Perubahan berikut harus muncul pada audit yang masih draft:

* Uraian pertanyaan.
* Urutan soal.
* Akses internal.
* Wajib foto.
* Improvement.
* Tambah, edit, atau hapus jawaban.
* Tambah, edit, atau hapus pertanyaan.
Aturan:
* DRAFT dan REOPENED mengikuti master terbaru.
* SUBMITTED tetap memakai snapshot sebelumnya.
* Audit baru selalu memakai versi terbaru.
* Jika pilihan jawaban dihapus, jawaban draft terkait dikosongkan.
* Jika soal dihapus, soal dikeluarkan dari progres draft dan diarsipkan dalam audit trail.
* Setelah master diperbarui, cache soal dihapus dan data dimuat ulang dari server.


Tahap 9 — Perbaikan hapus pengguna

* Penghapusan dilakukan melalui server.
* Gunakan is\_active = 0.
* Pengguna nonaktif tidak muncul dalam daftar aktif.
* Hapus dari cache client.
* Cabut seluruh session pengguna.
* Hilangkan fallback pengguna demo pada staging dan production.
* Muat ulang daftar dari D1 setelah penghapusan.
* Catat tindakan pada audit trail.


Tahap 10 — Perbaikan refresh dan tarik untuk sinkronisasi
10.1 Investigasi server
Gunakan requestId untuk mencari:

* Endpoint yang menghasilkan error.
* User, depo, periode, dan audit terkait.
* Query D1 yang gagal.
* Versi audit pada saat error.
* Kondisi session.
* Status upload R2.
* Apakah terjadi dua request bersamaan.
Log server harus menyimpan detail teknis, sedangkan pengguna tetap menerima pesan yang aman.
10.2 Urutan bootstrap aplikasi
Setelah refresh, proses harus berjalan berurutan:
1. Muat aplikasi dan service worker.
2. Periksa session.
3. Muat profil dan hak akses.
4. Muat daftar depo.
5. Tentukan depo dan periode aktif.
6. Muat audit dari D1.
7. Periksa antrean draft lokal.
8. Sinkronkan perubahan yang belum masuk D1.
9. Perbarui tampilan.
Dashboard dan halaman audit tidak boleh meminta data sebelum pemeriksaan session selesai.
10.3 Pengendalian request ganda
Tambahkan satu pengendali sinkronisasi:
* Hanya satu proses refresh boleh berjalan.
* Tarikan kedua diabaikan sampai proses pertama selesai.
* Request GET lama dibatalkan saat filter berubah.
* Setiap proses memiliki syncRunId.
* Response lama tidak boleh menggantikan response terbaru.
* Tombol dan gesture refresh menampilkan status Menyinkronkan.
10.4 Sinkronisasi draft
Urutan sinkronisasi:
1. Simpan perubahan ke IndexedDB sebagai pending.
2. Kirim jawaban ke D1.
3. Upload bukti ke R2.
4. Simpan metadata bukti ke D1.
5. Tandai cache lokal sebagai synced.
6. Ambil ulang progres dan index dari server.
Jika salah satu tahap gagal:
* Draft lokal tetap dipertahankan.
* Status menjadi Belum tersinkron.
* Pengguna dapat mencoba kembali.
* Data tidak ditandai tersimpan sebelum seluruh proses berhasil.
Gunakan:
* client\_version
* updated\_at
* idempotency\_key
untuk mencegah jawaban, foto, dan audit event ganda.
10.5 Service worker
Aturan caching:
* /api/\*: selalu network-only.
* Foto privat: tidak masuk cache publik.
* Navigasi aplikasi: network-first dengan fallback app shell.
* Hapus cache versi lama setelah aktivasi service worker baru.
* Jangan pernah menyimpan response pengguna atau audit dalam cache global.
10.6 Penanganan error frontend
Jika sinkronisasi gagal, tampilkan pesan ringkas:
Sinkronisasi gagal
Data draft tetap tersimpan di perangkat.

Coba Lagi
ID: 7b74de44...
Ketentuan:

* Jangan mengosongkan halaman.
* Jangan menghapus progres yang sudah tampil.
* Jangan mengarahkan pengguna keluar.
* GET dapat dicoba ulang maksimal dua kali.
* Operasi simpan hanya dicoba ulang dengan idempotency key.
* Bedakan status offline, konflik data, session habis, dan server error.
10.7 Penanganan error backend
* Pisahkan error autentikasi, validasi, konflik versi, D1, dan R2.
* Jangan mengubah seluruh error menjadi INTERNAL\_SERVER\_ERROR.
* Seluruh error menyertakan requestId.
* Stack trace hanya masuk log server.
* Query terhadap data kosong atau nullable tidak boleh menghasilkan exception.
* Pastikan semua migrasi database sudah diterapkan sebelum Worker baru aktif.


Tahap 11 — Perbaikan logout
Saat pengguna menekan keluar:

1. Panggil endpoint logout.
2. Cabut session dari D1.
3. Hapus cookie session.
4. Bersihkan state pengguna.
5. Bersihkan cache privat dan pilihan depo.
6. Arahkan ke /login menggunakan replace.
7. Tombol Back tidak boleh membuka halaman privat.
8. Refresh setelah logout tetap berada di halaman login.


Tahap 12 — Pengujian
Refresh dan sinkronisasi
Lakukan pengujian:

* Refresh browser minimal 20 kali.
* Tarik ke bawah berulang.
* Tutup dan buka kembali PWA.
* Perpindahan jaringan online–offline–online.
* Session kedaluwarsa saat aplikasi terbuka.
* Dua perangkat menggunakan akun yang sama.
* Dua akun yang berhak melihat audit yang sama.
* Refresh saat foto sedang diunggah.
* Refresh setelah jawaban tersimpan tetapi foto belum selesai.
* Perpindahan depo saat request sebelumnya masih berjalan.
Kriteria kelulusan:
* Tidak ada HTTP 500.
* Tidak ada draft hilang.
* Tidak ada foto berpindah soal.
* Tidak ada jawaban atau foto ganda.
* Progres dan index sama di seluruh perangkat.
* Error selalu dapat dilacak melalui requestId.
Pengujian lainnya
* Login dan wajib ganti password.
* Remember Me.
* Logout dan tombol Back.
* Instalasi PWA.
* Tampilan mobile 360 px.
* Auditor dengan beberapa depo.
* Master soal memperbarui audit draft.
* Audit submitted tetap utuh.
* Pengguna yang dihapus tidak muncul kembali.
* TypeScript, lint, seluruh test, dan production build harus lolos.


Tahap 13 — Urutan deployment

1. Backup D1 production.
2. Reproduksi error refresh di staging.
3. Temukan endpoint penyebab melalui log requestId.
4. Implementasikan autentikasi aplikasi dan session.
5. Implementasikan perbaikan refresh dan sinkronisasi.
6. Implementasikan perubahan halaman.
7. Jalankan seluruh pemeriksaan kode.
8. Deploy staging.
9. Uji refresh dan tarik sinkronisasi dengan dua perangkat.
10. Uji PIC satu depo dan auditor beberapa depo.
11. Uji instalasi PWA sebelum login.
12. Ubah kebijakan Cloudflare Access staging.
13. Jalankan pilot terbatas.
14. Deploy production.
15. Ubah kebijakan Cloudflare Access production.
16. Pantau error, login, sinkronisasi draft, D1, dan R2 selama masa pilot.

