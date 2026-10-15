/**
 * Starter CMS content (docs/blueprint/14 §7). Drafts written for Meta App Review and Indonesian creators;
 * they MUST be reviewed by the company's legal counsel before launch and are edited at /admin/pages.
 * Seeded only when the row doesn't exist; an edited page is never overwritten.
 */
const REVIEW = '<p><em>Draf awal. Tinjau bersama penasihat hukum sebelum peluncuran.</em></p>'

export const SEED_PAGES: { slug: string, title: string, metaDescription: string, content: string }[] = [
  {
    slug: 'privacy',
    title: 'Kebijakan Privasi',
    metaDescription: 'Data apa yang dikumpulkan Socialz.id, untuk apa, berapa lama disimpan, dan hak kamu atas data tersebut.',
    content: `${REVIEW}
<p>Kebijakan ini menjelaskan bagaimana Socialz.id ("kami") mengumpulkan, memakai, menyimpan dan melindungi data pribadi kamu, sesuai Undang-Undang Pelindungan Data Pribadi (UU PDP).</p>
<h2>Data yang kami kumpulkan</h2>
<ul>
<li><strong>Data akun:</strong> nama, email, nomor HP (opsional), zona waktu dan kata sandi (disimpan dalam bentuk hash, tidak pernah terbaca).</li>
<li><strong>Data dari Meta (Instagram, Threads, Facebook):</strong> saat kamu menghubungkan akun, kami menerima ID dan nama pengguna akun, foto profil, token akses, serta izin yang kamu berikan. Untuk Balas Otomatis kami menerima komentar pada postinganmu (ID komentar, nama pengguna dan teks komentar) agar bisa mengirim DM berisi link produk.</li>
<li><strong>Konten yang kamu buat:</strong> caption, foto dan video yang kamu jadwalkan, link produk, isi Etalase dan aturan Balas Otomatis.</li>
<li><strong>Data klik link:</strong> waktu, perangkat, kota/negara perkiraan, dan sumber klik. Alamat IP <strong>tidak disimpan</strong>; kami hanya menyimpan hash IP dengan garam harian untuk menghitung pengunjung unik, dan garam tersebut dihapus setiap hari.</li>
<li><strong>Data pembayaran:</strong> nomor pesanan, jumlah, status dan metode pembayaran. Data kartu atau rekening diproses oleh penyedia pembayaran dan tidak pernah kami simpan.</li>
</ul>
<h2>Untuk apa data dipakai</h2>
<ul>
<li>Menerbitkan postingan yang kamu jadwalkan ke akun yang kamu hubungkan.</li>
<li>Mengirim DM berisi link produk kepada orang yang berkomentar sesuai aturan yang kamu buat.</li>
<li>Menampilkan statistik klik link dan Etalase kepadamu.</li>
<li>Memproses langganan, mengirim pengingat dan email layanan.</li>
<li>Menjaga keamanan layanan dan mencegah penyalahgunaan.</li>
</ul>
<p>Kami <strong>tidak menjual</strong> data pribadi dan tidak memakai data dari Meta untuk iklan atau tujuan lain di luar fitur yang kamu pakai.</p>
<h2>Berapa lama data disimpan</h2>
<ul>
<li>Teks komentar dari Balas Otomatis dihapus otomatis setelah 30 hari; yang tersisa hanya status pengiriman.</li>
<li>Token akses Meta dihapus saat kamu memutus akun atau menghapus akun Socialz.id.</li>
<li>Data akun disimpan selama akun aktif dan dihapus sesuai permintaan penghapusan. Catatan transaksi disimpan sesuai kewajiban hukum perpajakan.</li>
</ul>
<h2>Keamanan</h2>
<p>Token dan kunci rahasia dienkripsi (AES-256-GCM) saat disimpan. Koneksi selalu memakai HTTPS. Akses staf dibatasi peran dan setiap tindakan penting tercatat.</p>
<h2>Hak kamu</h2>
<ul>
<li>Mengunduh semua datamu dari menu Pengaturan → Data.</li>
<li>Memutus akun media sosial kapan saja dari menu Akun Sosial.</li>
<li>Meminta penghapusan akun dan data. Lihat <a href="/hapus-akun">cara menghapus akun</a>. Jika kamu menghapus Socialz.id dari pengaturan Instagram atau Facebook, permintaan penghapusan data dari Meta juga kami proses.</li>
</ul>
<h2>Kontak</h2>
<p>Pertanyaan tentang privasi bisa dikirim lewat halaman kontak di situs ini.</p>`
  },
  {
    slug: 'terms',
    title: 'Syarat & Ketentuan',
    metaDescription: 'Aturan pemakaian Socialz.id: akun, langganan, uji coba, pembayaran, pembatalan dan pemakaian yang dilarang.',
    content: `${REVIEW}
<p>Dengan mendaftar dan memakai Socialz.id, kamu setuju dengan syarat berikut.</p>
<h2>Akun</h2>
<ul>
<li>Kamu bertanggung jawab atas keamanan akun dan semua aktivitas di dalamnya.</li>
<li>Akun media sosial yang dihubungkan harus milikmu atau kamu punya izin untuk mengelolanya.</li>
</ul>
<h2>Langganan, uji coba dan pembayaran</h2>
<ul>
<li>Paket Gratis bisa dipakai tanpa batas waktu dengan batasan sesuai halaman Harga.</li>
<li>Akun baru bisa mendapat uji coba paket berbayar. Setelah uji coba selesai, akun otomatis kembali ke paket Gratis tanpa tagihan.</li>
<li>Langganan dibayar di muka (bulanan atau tahunan). Tidak ada penagihan otomatis; kami mengirim pengingat sebelum paket berakhir.</li>
<li>Jika pembayaran perpanjangan belum diterima saat periode berakhir, ada masa tenggang beberapa hari. Setelah itu paket turun ke Gratis. <strong>Data tidak dihapus</strong>; akun, aturan dan Etalase yang melebihi batas paket dinonaktifkan sementara.</li>
<li>Pembatalan langganan berlaku di akhir periode yang sudah dibayar. Ketentuan pengembalian dana ada di <a href="/page/kebijakan-pembayaran">Kebijakan Pembayaran</a>.</li>
</ul>
<h2>Pemakaian yang dilarang</h2>
<ul>
<li>Spam, termasuk mengirim DM berulang ke orang yang tidak berkomentar atau tidak meminta.</li>
<li>Mempromosikan produk ilegal, penipuan, perjudian, atau konten yang melanggar hukum Indonesia.</li>
<li>Melanggar aturan Instagram, Threads, Facebook atau marketplace afiliasi.</li>
<li>Mencoba membobol, membebani atau menyalahgunakan layanan.</li>
</ul>
<p>Kami dapat menonaktifkan link, menurunkan Etalase atau menangguhkan akun yang melanggar, dengan pemberitahuan alasannya.</p>
<h2>Layanan pihak ketiga</h2>
<p>Penerbitan dan DM bergantung pada API Meta. Jika platform membatasi atau mengubah layanannya, fitur tertentu dapat tertunda atau berubah. Kami berusaha memberi tahu dan menunda postingan secara aman, bukan menerbitkannya dua kali.</p>
<h2>Perubahan</h2>
<p>Syarat ini dapat berubah. Perubahan penting akan kami umumkan lewat email atau notifikasi di aplikasi.</p>`
  },
  {
    slug: 'kebijakan-pembayaran',
    title: 'Kebijakan Pembayaran',
    metaDescription: 'Cara pembayaran, perpanjangan manual, masa tenggang dan pengembalian dana di Socialz.id.',
    content: `${REVIEW}
<h2>Cara membayar</h2>
<p>Pilih paket di menu Paket &amp; Pembayaran, lalu bayar lewat QRIS, e-wallet, transfer virtual account atau kartu di halaman pembayaran yang aman. Paket aktif begitu pembayaran diterima.</p>
<h2>Perpanjangan</h2>
<p>Tidak ada penagihan otomatis. Kami mengingatkan 7, 3 dan 1 hari sebelum paket berakhir. Memperpanjang lebih awal tidak menghilangkan sisa hari: periode baru ditambahkan setelah periode berjalan.</p>
<h2>Masa tenggang</h2>
<p>Jika periode berakhir tanpa perpanjangan, paket tetap berjalan selama masa tenggang, lalu turun ke Gratis. Data tidak dihapus.</p>
<h2>Pengembalian dana</h2>
<p>Pembayaran yang sudah diterima pada umumnya tidak dapat dikembalikan, kecuali terjadi tagihan ganda atau kesalahan dari pihak kami. Hubungi kami lewat halaman kontak dengan menyertakan nomor pesanan.</p>`
  },
  {
    slug: 'bantuan',
    title: 'Bantuan',
    metaDescription: 'Panduan cepat memakai Socialz.id: hubungkan Instagram, buat Etalase, dan jadwalkan postingan pertama.',
    content: `<h2>Mulai dalam 5 menit</h2>
<ol>
<li><strong>Hubungkan Instagram.</strong> Buka Akun Sosial → Hubungkan Instagram. Akun harus Bisnis atau Kreator (ubah gratis di pengaturan Instagram).</li>
<li><strong>Tempel link produk.</strong> Buka Link Produk → Tambah Produk, tempel link Shopee, Tokopedia atau TikTok Shop. Judul, foto dan harga terisi sendiri.</li>
<li><strong>Buat Etalase.</strong> Pilih nama Etalase, lalu pasang alamatnya di bio Instagram.</li>
<li><strong>Jadwalkan postingan.</strong> Tekan Buat Postingan, tulis caption, tambahkan foto, pilih jam yang disarankan, lalu Jadwalkan.</li>
</ol>
<h2>Kenapa link di caption Instagram tidak bisa diklik?</h2>
<p>Instagram tidak membuat link di caption bisa diklik. Pakai Etalase di bio, atau Balas Otomatis supaya link terkirim lewat DM saat ada yang berkomentar.</p>
<h2>Postingan gagal terbit?</h2>
<p>Buka Postingan → Gagal. Setiap postingan gagal punya alasan dan tombol untuk memperbaikinya. Jika akun perlu dihubungkan ulang, tekan Hubungkan ulang.</p>`
  }
]

export const SEED_FAQS: { question: string, answer: string, category: string }[] = [
  { question: 'Apa itu Socialz.id?', answer: 'Alat untuk kreator afiliasi: jadwalkan postingan ke Instagram, Threads dan Facebook, simpan link produk sebagai link pendek yang menghitung klik, buat Etalase untuk link di bio, dan kirim link produk otomatis lewat DM saat ada yang berkomentar.', category: 'umum' },
  { question: 'Apakah Socialz.id gratis?', answer: 'Ya. Paket Gratis bisa dipakai selamanya untuk 2 akun media sosial dan 20 postingan terjadwal per bulan. Akun baru juga mendapat uji coba paket Kreator.', category: 'harga' },
  { question: 'Akun Instagram apa yang didukung?', answer: 'Akun Bisnis atau Kreator. Akun pribadi bisa diubah gratis di pengaturan Instagram: Pengaturan → Jenis akun dan alat → Beralih ke akun profesional.', category: 'akun' },
  { question: 'Kenapa link di caption Instagram tidak bisa diklik?', answer: 'Itu aturan Instagram. Solusinya: pasang Etalase di bio, atau pakai Balas Otomatis supaya link produk terkirim lewat DM saat orang berkomentar "mau".', category: 'fitur' },
  { question: 'Bagaimana cara bayar?', answer: 'Lewat QRIS, e-wallet, transfer virtual account atau kartu. Tidak ada tagihan otomatis: kamu memperpanjang sendiri, dan kami ingatkan sebelum paket berakhir.', category: 'harga' },
  { question: 'Bagaimana cara berhenti langganan?', answer: 'Buka Paket & Pembayaran → Batalkan langganan. Paket tetap aktif sampai akhir periode, lalu turun ke Gratis. Data kamu tidak dihapus.', category: 'harga' },
  { question: 'Apakah data saya aman?', answer: 'Token akun dienkripsi, alamat IP pengunjung tidak disimpan, dan kami tidak menjual data. Kamu bisa mengunduh atau menghapus datamu kapan saja.', category: 'privasi' },
  { question: 'Bagaimana cara menghubungi tim?', answer: 'Lewat formulir kontak di halaman ini atau WhatsApp dukungan. Kami biasanya membalas dalam 1 hari kerja.', category: 'umum' }
]
