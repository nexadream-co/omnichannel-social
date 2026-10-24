# Admin screenshots manifest (UX audit)

Captured 2026-10-23T21:58:43.218Z against https://socialz.fajrsyauqi.com (tunnel to local dev). Logged in as the staff admin for logged-in routes. Dark captures use colorScheme dark. Facts only.

| filename | route | state | notes |
|---|---|---|---|
| admin-login-desktop.jpg | /admin/auth/login | - | heading "Masuk back-office"; slow load 4248ms; console errors: Failed to load resource: the server responded with a status of 401 () |
| admin-forgot-password-desktop.jpg | /admin/auth/forgot-password | - | heading "Lupa kata sandi"; console errors: Failed to load resource: the server responded with a status of 401 () |
| admin-login-phone.jpg | /admin/auth/login | - | heading "Masuk back-office"; console errors: Failed to load resource: the server responded with a status of 401 () |
| admin-forgot-password-phone.jpg | /admin/auth/forgot-password | - | heading "Lupa kata sandi"; console errors: Failed to load resource: the server responded with a status of 401 () |
| admin-root-desktop.jpg | /admin → /admin/dashboard | - | heading "Dasbor" |
| admin-dashboard-desktop.jpg | /admin/dashboard | - | heading "Dasbor" |
| admin-dashboard-sidebar-collapsed-desktop.jpg | /admin/dashboard | sidebar-collapsed | heading "Dasbor"; clicked "Ciutkan sidebar" |
| admin-users-desktop.jpg | /admin/users | - | heading "Pengguna kreator"; 25 table rows |
| admin-users-pagination-next-desktop.jpg | /admin/users | pagination-next | heading "Pengguna kreator"; 4 table rows; clicked next page |
| admin-users-row-menu-desktop.jpg | /admin/users | row-menu | heading "Pengguna kreator"; 25 table rows; no row action trigger with aria-haspopup found |
| admin-users-search-demo-desktop.jpg | /admin/users | search-demo | heading "Pengguna kreator"; 1 table rows; typed "demo" in search field (not submitted) |
| admin-workspaces-desktop.jpg | /admin/workspaces | - | heading "Ruang kerja"; 25 table rows |
| admin-workspaces-detail-desktop.jpg | /admin/workspaces/01a1693a-ab0f-75df-a2a0-8a9e6e1810ca | detail | heading "Cek Rencana" |
| admin-subscriptions-desktop.jpg | /admin/subscriptions | - | heading "Langganan"; 25 table rows |
| admin-payments-desktop.jpg | /admin/payments | - | heading "Pembayaran"; 2 table rows |
| admin-plans-desktop.jpg | /admin/plans | - | heading "Paket" |
| admin-plans-create-dialog-desktop.jpg | (same page) /admin/plans | create-dialog | heading "Paket"; no match for /^\s*\+?\s*(Tambah/Buat/Baru)/ |
| admin-payment-gateways-desktop.jpg | /admin/payment-gateways | - | heading "Payment gateway" |
| admin-social-accounts-desktop.jpg | /admin/social-accounts | - | heading "Kesehatan akun sosial"; 10 table rows |
| admin-publish-failures-desktop.jpg | /admin/publish-failures | - | heading "Postingan gagal" |
| admin-links-desktop.jpg | /admin/links | - | heading "Moderasi link & Etalase"; 25 table rows |
| admin-hashtags-desktop.jpg | /admin/hashtags | - | heading "Daftar tagar"; 25 table rows |
| admin-moments-desktop.jpg | /admin/moments | - | heading "Momen belanja"; 25 table rows |
| admin-reports-desktop.jpg | /admin/reports | - | heading "Laporan"; 13 table rows |
| admin-messages-desktop.jpg | /admin/messages | - | heading "Pesan masuk" |
| admin-meta-webhooks-desktop.jpg | /admin/meta-webhooks | - | heading "Meta webhook"; 4 table rows |
| admin-webhook-events-desktop.jpg | /admin/webhook-events | - | heading "Payment callback"; 2 table rows |
| admin-notifications-desktop.jpg | /admin/notifications | - | heading "Notifikasi" |
| admin-notification-templates-desktop.jpg | /admin/notification-templates | - | heading "Templat notifikasi" |
| admin-email-templates-desktop.jpg | /admin/email-templates | - | heading "Templat email" |
| admin-faq-desktop.jpg | /admin/faq | - | heading "FAQ" |
| admin-pages-desktop.jpg | /admin/pages | - | heading "Halaman" |
| admin-pages-detail-desktop.jpg | /admin/pages/01a140dc-5c02-702e-bd7f-6ec793255b0b | detail | heading "Bantuan" |
| admin-menus-desktop.jpg | /admin/menus | - | heading "Menu" |
| admin-roles-desktop.jpg | /admin/roles | - | heading "Peran" |
| admin-permissions-desktop.jpg | /admin/permissions | - | heading "Hak akses" |
| admin-staff-desktop.jpg | /admin/staff | - | heading "Staf"; 2 table rows |
| admin-settings-desktop.jpg | /admin/settings | - | heading "Pengaturan" |
| admin-settings-tab-email-keluar-desktop.jpg | (same page) /admin/settings | tab-email-keluar | heading "Pengaturan"; clicked tab "Email keluar" |
| admin-settings-tab-penagihan-desktop.jpg | (same page) /admin/settings | tab-penagihan | heading "Pengaturan"; clicked tab "Penagihan" |
| admin-settings-tab-privasi-data-desktop.jpg | (same page) /admin/settings | tab-privasi-data | heading "Pengaturan"; clicked tab "Privasi & data" |
| admin-settings-tab-aplikasi-desktop.jpg | (same page) /admin/settings | tab-aplikasi | heading "Pengaturan"; clicked tab "Aplikasi" |
| admin-settings-tab-kanal-otomasi-desktop.jpg | (same page) /admin/settings | tab-kanal-otomasi | heading "Pengaturan"; clicked tab "Kanal & otomasi" |
| admin-audit-logs-desktop.jpg | /admin/audit-logs | - | heading "Log aktivitas"; 50 table rows |
| admin-system-jobs-desktop.jpg | /admin/system/jobs | - | heading "Antrean pekerjaan"; 11 table rows |
| admin-profile-desktop.jpg | /admin/profile | - | heading "Profil" |
| admin-change-password-desktop.jpg | /admin/change-password | - | heading "Ubah kata sandi" |
| admin-root-phone.jpg | /admin → /admin/dashboard | - | heading "Dasbor" |
| admin-dashboard-phone.jpg | /admin/dashboard | - | heading "Dasbor" |
| admin-dashboard-nav-open-phone.jpg | /admin/dashboard | nav-open | heading "Dasbor"; no match for /menu/navigasi/ |
| admin-users-phone.jpg | /admin/users | - | heading "Pengguna kreator"; 25 table rows |
| admin-workspaces-phone.jpg | /admin/workspaces | - | heading "Ruang kerja"; 25 table rows |
| admin-workspaces-detail-phone.jpg | /admin/workspaces/01a1693a-ab0f-75df-a2a0-8a9e6e1810ca | detail | heading "Cek Rencana" |
| admin-subscriptions-phone.jpg | /admin/subscriptions | - | heading "Langganan"; 25 table rows |
| admin-payments-phone.jpg | /admin/payments | - | heading "Pembayaran"; 2 table rows |
| admin-plans-phone.jpg | /admin/plans | - | heading "Paket" |
| admin-payment-gateways-phone.jpg | /admin/payment-gateways | - | heading "Payment gateway" |
| admin-social-accounts-phone.jpg | /admin/social-accounts | - | heading "Kesehatan akun sosial"; 10 table rows |
| admin-publish-failures-phone.jpg | /admin/publish-failures | - | heading "Postingan gagal" |
| admin-links-phone.jpg | /admin/links | - | heading "Moderasi link & Etalase"; 25 table rows |
| admin-hashtags-phone.jpg | /admin/hashtags | - | heading "Daftar tagar"; 25 table rows |
| admin-moments-phone.jpg | /admin/moments | - | heading "Momen belanja"; 25 table rows |
| admin-reports-phone.jpg | /admin/reports | - | heading "Laporan"; 13 table rows |
| admin-messages-phone.jpg | /admin/messages | - | heading "Pesan masuk" |
| admin-meta-webhooks-phone.jpg | /admin/meta-webhooks | - | heading "Meta webhook"; 4 table rows |
| admin-webhook-events-phone.jpg | /admin/webhook-events | - | heading "Payment callback"; 2 table rows |
| admin-notifications-phone.jpg | /admin/notifications | - | heading "Notifikasi" |
| admin-notification-templates-phone.jpg | /admin/notification-templates | - | heading "Templat notifikasi" |
| admin-email-templates-phone.jpg | /admin/email-templates | - | heading "Templat email" |
| admin-faq-phone.jpg | /admin/faq | - | heading "FAQ" |
| admin-pages-phone.jpg | /admin/pages | - | heading "Halaman" |
| admin-pages-detail-phone.jpg | /admin/pages/01a140dc-5c02-702e-bd7f-6ec793255b0b | detail | heading "Bantuan" |
| admin-menus-phone.jpg | /admin/menus | - | heading "Menu" |
| admin-roles-phone.jpg | /admin/roles | - | heading "Peran" |
| admin-permissions-phone.jpg | /admin/permissions | - | heading "Hak akses" |
| admin-staff-phone.jpg | /admin/staff | - | heading "Staf"; 2 table rows |
| admin-settings-phone.jpg | /admin/settings | - | heading "Pengaturan" |
| admin-settings-tab-email-keluar-phone.jpg | (same page) /admin/settings | tab-email-keluar | heading "Pengaturan"; action failed: locator.click: Timeout 30000ms exceeded. Call log: [2m - waiting for locator('[role="tab"]').nth(1)[22m [2m - locator |
| admin-settings-tab-penagihan-phone.jpg | (same page) /admin/settings | tab-penagihan | heading "Pengaturan"; action failed: locator.click: Timeout 30000ms exceeded. Call log: [2m - waiting for locator('[role="tab"]').nth(2)[22m [2m - locator |
| admin-settings-tab-privasi-data-phone.jpg | (same page) /admin/settings | tab-privasi-data | heading "Pengaturan"; action failed: locator.click: Timeout 30000ms exceeded. Call log: [2m - waiting for locator('[role="tab"]').nth(3)[22m [2m - locator |
| admin-settings-tab-aplikasi-phone.jpg | (same page) /admin/settings | tab-aplikasi | heading "Pengaturan"; action failed: locator.click: Timeout 30000ms exceeded. Call log: [2m - waiting for locator('[role="tab"]').nth(4)[22m [2m - locator |
| admin-settings-tab-kanal-otomasi-phone.jpg | (same page) /admin/settings | tab-kanal-otomasi | heading "Pengaturan"; action failed: locator.click: Timeout 30000ms exceeded. Call log: [2m - waiting for locator('[role="tab"]').nth(5)[22m [2m - locator |
| admin-audit-logs-phone.jpg | /admin/audit-logs | - | heading "Log aktivitas"; 50 table rows |
| admin-system-jobs-phone.jpg | /admin/system/jobs | - | heading "Antrean pekerjaan"; 11 table rows |
| admin-profile-phone.jpg | /admin/profile | - | heading "Profil" |
| admin-change-password-phone.jpg | /admin/change-password | - | heading "Ubah kata sandi" |
| admin-dashboard-desktop-dark.jpg | /admin/dashboard | - | heading "Dasbor" |
| admin-users-desktop-dark.jpg | /admin/users | - | heading "Pengguna kreator"; 25 table rows |
| admin-workspaces-desktop-dark.jpg | /admin/workspaces | - | heading "Ruang kerja"; 25 table rows |
| admin-settings-desktop-dark.jpg | /admin/settings | - | heading "Pengaturan" |

## Failures
- none
