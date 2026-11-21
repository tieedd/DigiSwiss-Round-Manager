# DigiSwiss-Push-Notify (Google Apps Script)

Layanan pengirim push notification (FCM HTTP v1) untuk **DigiSwiss-Round-Manager** pada Firebase paket Spark (tanpa Cloud Functions).

## Prasyarat
- Akun Google yang digunakan untuk men-deploy Apps Script adalah **pemilik / editor proyek GCP `digiswiss-round`** (memiliki akses Firestore dan Firebase Cloud Messaging API).
- Pastikan **Firebase Cloud Messaging API (V1)** aktif di Google Cloud Console untuk proyek `digiswiss-round`.

## Langkah Deploy

1. Buka [script.google.com](https://script.google.com) dan buat **New project** (misalnya beri nama `DigiSwiss Push Notify`).
2. Di menu **Project Settings** (ikon roda gigi), centang **Show "appsscript.json" manifest file in editor**.
3. Buka file `appsscript.json` di editor Apps Script, lalu ganti seluruh isinya dengan isi file `server/push-notify/appsscript.json`.
4. Buat/salin file skrip berikut ke proyek Apps Script yang sama:
   - Buat file script bernama `Logic` (atau `logic.js` / tempel sebagai `Logic.gs`) lalu tempel seluruh isi `server/push-notify/logic.js`.
   - Pada file `Code.gs`, ganti seluruh isinya dengan isi `server/push-notify/Code.gs`.
   - *(Opsional)* Pastikan file `Logic` berada di proyek yang sama agar fungsi seperti `PUSH_EVENT_TYPES`, `resolveNotificationPlan`, dll. tersedia secara global bagi `Code.gs`.
5. Klik **Deploy → New deployment**:
   - Type: **Web app**
   - Description: `DigiSwiss Push Notify v1`
   - Execute as: **Me** (`USER_DEPLOYING`)
   - Who has access: **Anyone** (`ANYONE_ANONYMOUS`)
6. Klik **Deploy**, lalu selesaikan persetujuan izin OAuth (`cloud-platform` dan `script.external_request`).
7. Salin **Web app URL** (`https://script.google.com/macros/s/.../exec`), lalu tempel ke konstanta `PUSH_NOTIFY_ENDPOINT` di `src/config/pushConfig.ts`:
   ```ts
   export const PUSH_NOTIFY_ENDPOINT = 'https://script.google.com/macros/s/.../exec';
   ```
8. Bangun ulang / rilis pembaruan web/APK agar endpoint aktif digunakan aplikasi.

> **Catatan:** Selama `PUSH_NOTIFY_ENDPOINT` masih string kosong (`''`), aplikasi tetap berjalan normal tanpa menampilkan error dan tidak mengirim request push ke server.
