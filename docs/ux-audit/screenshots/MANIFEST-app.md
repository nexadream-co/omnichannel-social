# Screenshot manifest: public site and creator console (UX audit)

Captured 23–24 October 2026 with Playwright against the local dev server through its tunnel (https://socialz.fajrsyauqi.com), logged in as demo@socialz.local for `/app`. Phone = Pixel 7, desktop = 1440×900, locale id-ID. See [../README.md §7](../README.md#7-method-coverage-and-caveats) for method and caveats.

## Public and auth (`public/`)

The `auth-login-wrong-password-error-phone` shot shows the origin-check failure ("Terjadi kesalahan…"), because it was taken on localhost before switching to the tunnel; it is not the wrong-password message.

| filename | route | state captured | factual notes | console errors | slow load |
| public-landing-phone.jpg | / | default | HTTP 200; final /; title "Socialz.id · Jualan afiliasi lewat konten, tanpa ribet"; text: Socialz.id ID Jualan afiliasi lewat konten, tanpa ribet Buat postingan sekali dan pilih jamnya. Postingan terbit sendiri di Instagram, Threads dan Facebook, link produkmu rapi di satu tempat, dan komentar "mau" dibalas o | - | content settled after 12450ms |
| public-landing-desktop.jpg | / | default | HTTP 200; final /; title "Socialz.id · Jualan afiliasi lewat konten, tanpa ribet"; text: Socialz.id Fitur Cara kerja Harga FAQ Kontak ID Masuk Coba gratis Jualan afiliasi lewat konten, tanpa ribet Buat postingan sekali dan pilih jamnya. Postingan terbit sendiri di Instagram, Threads dan Facebook, link produk | - | content settled after 8349ms |
| public-harga-phone.jpg | /harga | default | HTTP 200; final /harga; title "Harga sederhana · Socialz.id"; text: Socialz.id ID Harga sederhana Mulai gratis. Upgrade kapan saja saat jualanmu tumbuh. Bulanan Tahunan · Hemat 17% Gratis Untuk mulai belajar jualan afiliasi. Gratis 2 akun media sosial 20 postingan per bulan 100 DM otomat | - | content settled after 4195ms |
| public-harga-desktop.jpg | /harga | default | HTTP 200; final /harga; title "Harga sederhana · Socialz.id"; text: Socialz.id Fitur Cara kerja Harga FAQ Kontak ID Masuk Coba gratis Harga sederhana Mulai gratis. Upgrade kapan saja saat jualanmu tumbuh. Bulanan Tahunan · Hemat 17% Gratis Untuk mulai belajar jualan afiliasi. Gratis 2 ak | - | content settled after 3414ms |
| public-privacy-phone.jpg | /privacy | default | HTTP 200; final /privacy; title "Kebijakan Privasi"; text: Socialz.id ID Kebijakan Privasi 16 Oktober 2026 Draf awal. Tinjau bersama penasihat hukum sebelum peluncuran. Kebijakan ini menjelaskan bagaimana Socialz.id ("kami") mengumpulkan, memakai, menyimpan dan melindungi data p | - | content settled after 5780ms |
| public-privacy-desktop.jpg | /privacy | default | HTTP 200; final /privacy; title "Kebijakan Privasi"; text: Socialz.id Fitur Cara kerja Harga FAQ Kontak ID Masuk Coba gratis Kebijakan Privasi 16 Oktober 2026 Draf awal. Tinjau bersama penasihat hukum sebelum peluncuran. Kebijakan ini menjelaskan bagaimana Socialz.id ("kami") me | - | content settled after 4533ms |
| public-terms-phone.jpg | /terms | default | HTTP 200; final /terms; title "Syarat & Ketentuan"; text: Socialz.id ID Syarat & Ketentuan 16 Oktober 2026 Draf awal. Tinjau bersama penasihat hukum sebelum peluncuran. Dengan mendaftar dan memakai Socialz.id, kamu setuju dengan syarat berikut. Akun Kamu bertanggung jawab atas  | - | content settled after 5134ms |
| public-terms-desktop.jpg | /terms | default | HTTP 200; final /terms; title "Syarat & Ketentuan"; text: Socialz.id Fitur Cara kerja Harga FAQ Kontak ID Masuk Coba gratis Syarat & Ketentuan 16 Oktober 2026 Draf awal. Tinjau bersama penasihat hukum sebelum peluncuran. Dengan mendaftar dan memakai Socialz.id, kamu setuju deng | - | content settled after 4230ms |
| public-legal-data-deletion-phone.jpg | /legal/data-deletion | default | HTTP 200; final /legal/data-deletion; title "Status penghapusan data"; text: Socialz.id ID Status penghapusan data Kode konfirmasi tidak ditemukan. Socialz.id Jadwalkan konten, kumpulkan link produk, balas komentar otomatis. Produk Harga Bantuan Kontak Legal Kebijakan Privasi Syarat & Ketentuan K | - | - |
| public-legal-data-deletion-desktop.jpg | /legal/data-deletion | default | HTTP 200; final /legal/data-deletion; title "Status penghapusan data"; text: Socialz.id Fitur Cara kerja Harga FAQ Kontak ID Masuk Coba gratis Status penghapusan data Kode konfirmasi tidak ditemukan. Socialz.id Jadwalkan konten, kumpulkan link produk, balas komentar otomatis. Produk Harga Bantuan | - | - |
| public-hapus-akun-phone.jpg | /hapus-akun | default | HTTP 200; final /hapus-akun; title "Cara menghapus akun Socialz.id"; text: Socialz.id ID Cara menghapus akun Socialz.id Kamu bisa meminta penghapusan akun Socialz.id kapan saja dengan salah satu cara berikut: Masuk ke aplikasi, buka Pengaturan, lalu pilih Kirim permintaan hapus. Atau kirim emai | - | content settled after 3560ms |
| public-hapus-akun-desktop.jpg | /hapus-akun | default | HTTP 200; final /hapus-akun; title "Cara menghapus akun Socialz.id"; text: Socialz.id Fitur Cara kerja Harga FAQ Kontak ID Masuk Coba gratis Cara menghapus akun Socialz.id Kamu bisa meminta penghapusan akun Socialz.id kapan saja dengan salah satu cara berikut: Masuk ke aplikasi, buka Pengaturan | - | - |
| public-bio-phone.jpg | /bio/kreator-demo | default | HTTP 404; final /bio/kreator-demo; title "Etalase tidak ditemukan"; text: Etalase tidak ditemukan Nama Etalase ini belum dipakai. | Failed to load resource: the server responded with a status of 404 (Not Found) | - |
| public-bio-desktop.jpg | /bio/kreator-demo | default | HTTP 404; final /bio/kreator-demo; title "Etalase tidak ditemukan"; text: Etalase tidak ditemukan Nama Etalase ini belum dipakai. | Failed to load resource: the server responded with a status of 404 (Not Found) | - |
| public-page-bantuan-phone.jpg | /page/bantuan | default | HTTP 200; final /page/bantuan; title "Bantuan"; text: Socialz.id ID Bantuan 16 Oktober 2026 Mulai dalam 5 menit Hubungkan Instagram. Buka Akun Sosial → Hubungkan Instagram. Akun harus Bisnis atau Kreator (ubah gratis di pengaturan Instagram). Tempel link produk. Buka Link P | - | content settled after 4017ms |
| public-page-bantuan-desktop.jpg | /page/bantuan | default | HTTP 200; final /page/bantuan; title "Bantuan"; text: Socialz.id Fitur Cara kerja Harga FAQ Kontak ID Masuk Coba gratis Bantuan 16 Oktober 2026 Mulai dalam 5 menit Hubungkan Instagram. Buka Akun Sosial → Hubungkan Instagram. Akun harus Bisnis atau Kreator (ubah gratis di pe | - | content settled after 3268ms |
| public-page-kebijakan-pembayaran-phone.jpg | /page/kebijakan-pembayaran | default | HTTP 200; final /page/kebijakan-pembayaran; title "Kebijakan Pembayaran"; text: Socialz.id ID Kebijakan Pembayaran 16 Oktober 2026 Draf awal. Tinjau bersama penasihat hukum sebelum peluncuran. Cara membayar Pilih paket di menu Paket & Pembayaran, lalu bayar lewat QRIS, e-wallet, transfer virtual acc | - | content settled after 4042ms |
| public-page-kebijakan-pembayaran-desktop.jpg | /page/kebijakan-pembayaran | default | HTTP 200; final /page/kebijakan-pembayaran; title "Kebijakan Pembayaran"; text: Socialz.id Fitur Cara kerja Harga FAQ Kontak ID Masuk Coba gratis Kebijakan Pembayaran 16 Oktober 2026 Draf awal. Tinjau bersama penasihat hukum sebelum peluncuran. Cara membayar Pilih paket di menu Paket & Pembayaran, l | - | content settled after 3426ms |
| auth-login-phone.jpg | /app/auth/login | default | HTTP 200; final /app/auth/login; title "Masuk ke Socialz.id"; text: Socialz.id ID Masuk ke Socialz.id Kelola postingan, link produk dan Etalase kamu. Email Kata sandi Lupa kata sandi? Masuk Belum punya akun? Daftar gratis | Failed to load resource: the server responded with a status of 401 (Sesi kamu sudah berakhir. Silakan masuk lagi.) | - |
| auth-login-desktop.jpg | /app/auth/login | default | HTTP 200; final /app/auth/login; title "Masuk ke Socialz.id"; text: Socialz.id ID Masuk ke Socialz.id Kelola postingan, link produk dan Etalase kamu. Email Kata sandi Lupa kata sandi? Masuk Belum punya akun? Daftar gratis | Failed to load resource: the server responded with a status of 401 (Sesi kamu sudah berakhir. Silakan masuk lagi.) | - |
| auth-register-phone.jpg | /app/auth/register | default | HTTP 200; final /app/auth/register; title "Daftar gratis"; text: Socialz.id ID Daftar gratis Coba semua fitur Kreator gratis selama 14 hari. Tanpa kartu kredit. Nama Email Kata sandi Minimal 8 karakter. Nomor HP (opsional) Saya menyetujui Syarat & Ketentuan dan Kebijakan Privasi Buat  | Failed to load resource: the server responded with a status of 401 (Sesi kamu sudah berakhir. Silakan masuk lagi.) | - |
| auth-register-desktop.jpg | /app/auth/register | default | HTTP 200; final /app/auth/register; title "Daftar gratis"; text: Socialz.id ID Daftar gratis Coba semua fitur Kreator gratis selama 14 hari. Tanpa kartu kredit. Nama Email Kata sandi Minimal 8 karakter. Nomor HP (opsional) Saya menyetujui Syarat & Ketentuan dan Kebijakan Privasi Buat  | Failed to load resource: the server responded with a status of 401 (Sesi kamu sudah berakhir. Silakan masuk lagi.) | - |
| auth-forgot-password-phone.jpg | /app/auth/forgot-password | default | HTTP 200; final /app/auth/forgot-password; title "Lupa kata sandi"; text: Socialz.id ID Lupa kata sandi Masukkan email kamu. Kami kirim tautan untuk membuat kata sandi baru. Email Kirim tautan Kembali | Failed to load resource: the server responded with a status of 401 (Sesi kamu sudah berakhir. Silakan masuk lagi.) | - |
| auth-forgot-password-desktop.jpg | /app/auth/forgot-password | default | HTTP 200; final /app/auth/forgot-password; title "Lupa kata sandi"; text: Socialz.id ID Lupa kata sandi Masukkan email kamu. Kami kirim tautan untuk membuat kata sandi baru. Email Kirim tautan Kembali | Failed to load resource: the server responded with a status of 401 (Sesi kamu sudah berakhir. Silakan masuk lagi.) | - |
| auth-login-wrong-password-error-phone.jpg | /app/auth/login | after submitting a wrong password | HTTP 200; final /app/auth/login; title "Masuk ke Socialz.id"; text: Socialz.id ID Masuk ke Socialz.id Kelola postingan, link produk dan Etalase kamu. Terjadi kesalahan. Coba lagi sebentar lagi. Email Kata sandi Lupa kata sandi? Masuk Belum punya akun? Daftar gratis | Failed to load resource: the server responded with a status of 401 (Sesi kamu sudah berakhir. Silakan masuk lagi.) / Failed to load resource: the server responded with a status of 403 (Permintaan ditolak.) | content settled after 6300ms |

## Creator console (`app/`)

Suffixes: `-phone` = first screen on a phone; `-phone-tall` = the whole page in a 412×2600 viewport (the console scrolls inside an inner container, so full-page shots stop at the viewport); `-desktop`; `-phone-dark` = system dark preference (renders light, see finding #10). Other infixes name the interactive state, e.g. `compose-link-picker`, `bio-item-menu`, `downgrade-gate`.

Not captured: `accounts/pick` (needs a live Meta connect), the phone calendar tabs (Bank Ide, Bulan) and the phone bell dropdown (the capture timed out through the tunnel; the desktop equivalents exist).

- app-accounts-desktop.jpg
- app-accounts-phone-tall.jpg
- app-accounts-phone.jpg
- app-analytics-desktop.jpg
- app-analytics-phone-tall.jpg
- app-analytics-phone.jpg
- app-auto-reply-activity-desktop.jpg
- app-auto-reply-activity-phone.jpg
- app-auto-reply-desktop.jpg
- app-auto-reply-detail-desktop.jpg
- app-auto-reply-detail-phone.jpg
- app-auto-reply-new-desktop.jpg
- app-auto-reply-new-phone-tall.jpg
- app-auto-reply-new-phone.jpg
- app-auto-reply-phone-tall.jpg
- app-auto-reply-phone.jpg
- app-auto-reply-product-picker-desktop.jpg
- app-auto-reply-product-picker-phone.jpg
- app-billing-desktop.jpg
- app-billing-phone-tall.jpg
- app-billing-phone.jpg
- app-billing-yearly-desktop.jpg
- app-billing-yearly-phone.jpg
- app-bio-desktop.jpg
- app-bio-item-menu-desktop.jpg
- app-bio-item-menu-phone.jpg
- app-bio-phone-tall.jpg
- app-bio-phone.jpg
- app-bio-product-picker-desktop.jpg
- app-bio-product-picker-phone.jpg
- app-calendar-desktop.jpg
- app-calendar-month-desktop.jpg
- app-calendar-new-idea-desktop.jpg
- app-calendar-new-idea-phone.jpg
- app-calendar-phone-tall.jpg
- app-calendar-phone.jpg
- app-change-password-desktop.jpg
- app-change-password-phone.jpg
- app-compose-advanced-open-desktop.jpg
- app-compose-advanced-open-phone.jpg
- app-compose-caption-desktop.jpg
- app-compose-caption-phone.jpg
- app-compose-desktop.jpg
- app-compose-gallery-picker-desktop.jpg
- app-compose-gallery-picker-phone.jpg
- app-compose-hashtag-suggest-desktop.jpg
- app-compose-hashtag-suggest-phone.jpg
- app-compose-link-picker-desktop.jpg
- app-compose-link-picker-phone.jpg
- app-compose-options-phone.jpg
- app-compose-phone-dark.jpg
- app-compose-phone-tall.jpg
- app-compose-phone.jpg
- app-dashboard-desktop.jpg
- app-dashboard-phone-dark.jpg
- app-dashboard-phone-tall.jpg
- app-dashboard-phone.jpg
- app-does-not-exist-desktop.jpg
- app-does-not-exist-phone.jpg
- app-downgrade-gate-desktop.jpg
- app-downgrade-gate-phone.jpg
- app-help-desktop.jpg
- app-help-phone-tall.jpg
- app-help-phone.jpg
- app-link-detail-desktop.jpg
- app-link-detail-phone.jpg
- app-links-add-dialog-desktop.jpg
- app-links-desktop.jpg
- app-links-phone-tall.jpg
- app-links-phone.jpg
- app-media-desktop.jpg
- app-media-phone-tall.jpg
- app-media-phone.jpg
- app-nav-more-open-phone.jpg
- app-notifications-desktop.jpg
- app-notifications-phone-tall.jpg
- app-notifications-phone.jpg
- app-post-detail-desktop.jpg
- app-post-detail-phone.jpg
- app-posts-desktop.jpg
- app-posts-phone-tall.jpg
- app-posts-phone.jpg
- app-profile-desktop.jpg
- app-profile-phone.jpg
- app-settings-desktop.jpg
- app-settings-phone-tall.jpg
- app-settings-phone.jpg
- app-team-desktop.jpg
- app-team-phone.jpg
- app-user-menu-open-desktop.jpg
- app-user-menu-open-phone.jpg
