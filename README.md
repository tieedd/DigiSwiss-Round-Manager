# DigiSwiss-Round

**DigiSwiss-Round** adalah aplikasi manajer turnamen sistem Swiss Round khusus untuk **Digimon Card Game (TCG)** resmi Bandai. Aplikasi ini dirancang *mobile-first*, dibangun menggunakan **React 18 + TypeScript + Tailwind CSS**, dibungkus dalam proyek Android native (**Kotlin, WebView**) yang memuat hasil build web dari `app/src/main/assets/dist`, dengan pembaruan web lewat **OTA GitHub Release** dan pembaruan APK untuk perubahan native, serta didukung oleh backend cloud **Firebase Authentication & Firestore**.

---

## Fitur Utama

1. **Sistem Peran & Keamanan Tanpa Server (Zero-Trust):**
   - **Player:** Mendaftar ke turnamen, melihat pairing meja, menginput skor pertandingan, mengisi deck & warna (chip toggle), serta melihat riwayat dan statistik performa pribadi.
   - **Organizer:** Membuat turnamen (BO1 / BO3), menerima/menolak waiting list, menambah peserta manual, pairing otomatis sistem Swiss tanpa rematch dan dengan BYE non-berulang, timer ronde digital, penukaran meja manual, revert ronde dengan pengarsipan, finalisasi hasil resmi, serta ekspor gambar/teks/CSV.
   - **Admin:** Memantau seluruh pengguna dan turnamen di sistem, mengelola peran, menonaktifkan akun, serta melihat statistik meta global dan audit keamanan turnamen.

2. **Perhitungan Skor & Tie-Breaker Resmi Bandai:**
   - **BO1:** Menang = 3 poin, Kalah = 0 poin.
   - **BO3:** 2-0 = 3 poin, 2-1 = 2 poin, 1-2 = 1 poin (kalah 1-2 tetap mendapatkan 1 poin), 0-2 = 0 poin.
   - **Urutan Tie-Breaker:** (1) OMW% (Opponent Match Win %), (2) GW% (Game Win %), (3) OGW% (Opponent Game Win %), (4) Head-to-Head.
   - Aturan batas minimum 33.33% per lawan dan pertandingan BYE tidak dihitung sebagai lawan pada OMW/OGW.

3. **Timer Ronde Digital & Presisi:**
   - Angka hitung mundur besar (48px+ tabular font-mono tanpa dekorasi) yang tersinkronisasi real-time antar seluruh pengguna.
   - Sisa waktu dihitung dari timestamp server dikoreksi clock offset.
   - Indikator warna: Kuning pada sisa 5 menit, merah berkedip saat waktu habis, disertai efek getaran haptik.
   - Kontrol organizer: Mulai, Jeda, Lanjutkan (hanya valid dari status dijeda), dan Reset.

4. **Finalisasi Hasil & Pengisian Deck:**
   - Pembuatan batch atomik `participations/{tid}_{pid}` saat turnamen selesai.
   - Player dapat memilih nama deck dari riwayat turnamen sebelumnya (otomatis mengisi kombinasi warnanya) atau membuat baru.
   - Pilihan warna resmi Bandai Digimon TCG (Merah, Biru, Kuning, Hijau, Hitam, Ungu, Putih) dengan dukungan multi-warna (minimal 1).
   - Ekspor laporan dalam format: Gambar Kartu (PNG), Teks Ringkasan (Clipboard / TXT), dan Spreadsheet (CSV).

5. **Riwayat & Analisis Statistik:**
   - Filter pencarian nama dan tanggal dengan paginasi.
   - Detail pertandingan ronde per ronde untuk setiap pemain.
   - Grafik KPI dan visual bar yang ringan dan responsif di layar smartphone.
   - Pengecekan versi otomatis dari GitHub Releases dengan penanganan offline senyap (gagal diam-diam).

---

## Panduan Setup Firebase

Aplikasi ini menggunakan paket **Firebase Spark (Gratis)** tanpa memerlukan Cloud Functions atau layanan berbayar.

### 1. Buat Proyek Firebase
1. Buka [Firebase Console](https://console.firebase.google.com/).
2. Klik **Tambahkan Proyek** (*Add Project*).
3. Beri nama proyek, misalnya: `digiswiss-round`.
4. Nonaktifkan Google Analytics (karena sistem berjalan pada paket Spark murni).
5. Klik **Buat Proyek**.

### 2. Konfigurasi Web App & Kredensial
1. Di halaman ikhtisar proyek, klik ikon **Web** (`</>`).
2. Masukkan nama aplikasi web: `DigiSwiss-Round`.
3. Salin konfigurasi `firebaseConfig` yang diberikan.
4. Buka file `src/firebaseConfig.ts` di proyek ini dan sesuaikan nilainya:
```typescript
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

### 3. Aktifkan Firebase Authentication
1. Di menu bilah sisi Firebase Console, pilih **Build** > **Authentication**.
2. Klik tombol **Mulai** (*Get Started*).
3. Di tab **Sign-in method**, pilih **Email/Password**.
4. Aktifkan opsi **Email/Password** (opsi *Email link* dibiarkan nonaktif).
5. Klik **Simpan**.

> **Catatan Login:** Pengguna masuk hanya dengan username dan password. Sistem secara otomatis mengonversi username menjadi email semu dengan format: `<username-huruf-kecil>@digiswiss.app`.

### 4. Buat Database Cloud Firestore & Terapkan Aturan Keamanan
1. Di menu bilah sisi, pilih **Build** > **Firestore Database**.
2. Klik **Buat Database** (*Create database*).
3. Pilih lokasi server terdekat (misalnya `asia-southeast1` untuk Indonesia/Singapura).
4. Pilih opsi **Mulai dalam mode produksi** (*Start in production mode*).
5. Buka tab **Aturan** (*Rules*), lalu salin seluruh isi dari file `firestore.rules` yang disediakan dalam repositori ini, kemudian klik **Publikasikan** (*Publish*).

---

## Cara Menerapkan `firestore.rules`

Aturan keamanan Firestore menegakkan arsitektur Zero-Trust di sisi server. Untuk menerapkannya:

### Melalui Firebase Console:
1. Masuk ke [Firebase Console](https://console.firebase.google.com/).
2. Buka proyek Anda, lalu navigasikan ke **Firestore Database** > tab **Rules**.
3. Buka file `firestore.rules` di repositori ini, salin seluruh isinya (dari baris pertama `rules_version = '2';` hingga kurung kurawal terakhir).
4. Tempel ke editor aturan Firebase Console dan klik **Publish**.

### Melalui Firebase CLI:
Jika Anda menggunakan Firebase CLI di komputer lokal:
```bash
firebase deploy --only firestore:rules
```

---

## Prosedur Lupa Password

Aplikasi menyediakan tiga jalur pemulihan password sesuai peran pengguna:

1. **Pemain memakai PIN keamanan (mandiri):**
   - Di halaman **Masuk**, ketuk **Lupa password?** lalu pilih tab **Pakai PIN**.
   - Masukkan **Username**, **PIN 6 digit**, dan **Password Baru** (minimal 8 karakter).
   - Untuk mencegah tebakan paksa, salah memasukkan PIN 5 kali berturut-turut akan mengunci percobaan reset selama **15 menit**.
2. **Pemain lupa password sekaligus lupa PIN (Kode Reset dari Admin):**
   - Minta **Kode Reset** sekali pakai (10 karakter, berbatas waktu) kepada Administrator melalui menu **Kelola Pengguna > Kode Reset**.
   - Di layar **Lupa Password**, pilih tab **Kode dari Admin**, masukkan username, kode 10 karakter, dan password baru.
   - Setelah reset lewat kode berhasil, PIN lama otomatis dihapus dan pemain akan diminta membuat **PIN baru** pada login berikutnya.
3. **Admin Utama atau jalur cadangan:**
   - Akun Admin Utama (`admindss`) tidak dapat direset menggunakan PIN maupun Kode Reset dari aplikasi.
   - Pemulihan Admin Utama atau jalur cadangan dilakukan langsung melalui **Firebase Console** > **Authentication** > **Users** > pilih akun `<username>@digiswiss.app` > **Reset password**.

---

## Cara Build Lokal

### Prasyarat:
- Node.js versi 20+ atau 22+
- npm versi 10+
- Java JDK 17 atau 21 (untuk build Android)
- Android SDK (jika ingin mengompilasi APK secara lokal)

### 1. Menjalankan Versi Web (Development):
```bash
# Pasang dependensi
npm install

# Jalankan dev server lokal
npm run dev
```
Aplikasi dapat dibuka di browser pada alamat `http://localhost:5173`.

### 2. Menjalankan Unit Testing:
```bash
# Menjalankan seluruh pengujian unit otomatis
npm test
```

### 3. Membangun Bundle Web untuk Android:
```bash
# Kompilasi aplikasi web dan salin ke aset Android
npm run build
```
Hasil build akan terkompilasi di folder `dist/` dan otomatis disinkronkan ke `app/src/main/assets/dist`.

### 4. Membangun APK Android Lokal:
Di root direktori proyek:
```bash
# Linux / macOS
gradle :app:assembleDebug

# Atau jika di lingkungan Gradle lokal
./gradlew assembleDebug
```
File APK debug akan dihasilkan pada direktori:
`app/build/outputs/apk/debug/app-debug.apk`.

---

## Cara Memasang APK dari GitHub Releases

1. **Unduh File APK:**
   - Buka repositori GitHub aplikasi di browser ponsel Android Anda: [GitHub Releases](https://github.com/tieedd/DigiSwiss-Round-Manager/releases).
   - Pada rilis versi terbaru (misalnya `v1.0.0`), unduh file `app-debug.apk` atau `DigiSwiss-Round.apk` yang tersedia di bagian **Assets**.
2. **Aktifkan Izin Pemasangan:**
   - Jika ponsel memunculkan peringatan *"File ini mungkin berbahaya"* atau *"Ponsel Anda tidak diizinkan memasang aplikasi dari sumber ini"*, pilih **Setelan / Settings**.
   - Aktifkan opsi **"Izinkan dari sumber ini"** (*Allow from this source*) untuk browser yang Anda gunakan.
3. **Pasang Aplikasi:**
   - Ketuk file APK yang telah diunduh, lalu pilih **Pasang** (*Install*).
   - Tunggu hingga proses selesai, lalu ketuk **Buka** (*Open*).
4. **Login Pertama Kali:**
   - Aplikasi siap digunakan! Akun Administrator Utama akan otomatis diinisialisasi saat pertama kali aplikasi dibuka.

---

## Catatan Arsitektur & Keamanan Terbaru

### 1. Sistem PIN Keamanan 6-Digit (`userPins/{uid}`)
- **Kriptografi Kuat di Sisi Klien:** PIN 6 digit di-hash secara aman menggunakan **Web Crypto API (`crypto.subtle`)** dengan algoritma **PBKDF2-SHA256**, iterasi minimum **150.000 kali**, dan salt acak kriptografis 16 byte.
- **Pencegahan PIN Lemah:** Sistem secara otomatis menolak kombinasi angka yang mudah ditebak, termasuk 6 angka identik (`111111`), pola angka berurutan naik/turun (`123456`, `654321`), dan pola pengulangan 2/3 angka (`121212`, `123123`).
- **Proteksi Brute-Force & Kunci Akun:** Jika salah memasukkan PIN sebanyak 5 kali berturut-turut, PIN akun dikunci secara otomatis selama **15 menit** dengan hitung mundur waktu tersisa.
- **Perlindungan Dokumen Firestore:** Koleksi `userPins/{uid}` hanya dapat dibaca dan diperbarui oleh pemilik akun aktif yang bersangkutan. Administrator sekalipun tidak memiliki hak akses baca terhadap hash PIN pengguna lain, dan penghapusan dokumen PIN dilarang secara permanen (`allow delete: if false;`). Penggantian hash PIN pada Firestore rules mewajibkan token otentikasi segar (`auth_time < 300` detik).
- **Catatan Pengembangan Masa Depan (Server-side Functions):** Karena aplikasi ini berjalan pada arsitektur Firebase Spark tanpa server, hashing dan verifikasi PIN saat ini dilakukan via Web Crypto API klien dengan perlindungan aturan Firestore. Di masa depan bila proyek di-upgrade ke paket Blaze dengan Cloud Functions, verifikasi PIN dapat dipindahkan sepenuhnya ke server-side callable function untuk memperketat pertahanan pertahanan berlapis.

### 2. Tema Terang & Gelap (Light / Dark Mode)
- **Token CSS Variables Berbasis Alpha:** Seluruh token warna latar belakang, permukaan, border, dan teks dialihkan ke variabel CSS RGB (`rgb(var(--c-nama) / <alpha-value>)`).
- **Penyesuaian Aksesibilitas & Kontras:** Pada mode terang (`data-theme="light"`), warna teks aksen dan status otomatis disesuaikan ke tone yang lebih gelap (misal `#C25E00`, `#15803D`) untuk menjamin rasio kontras teks terhadap latar belakang $\ge 4.5:1$.
- **Sinkronisasi Sistem Operasi & Android Native:** Mengikuti preferensi bawaan sistem (`prefers-color-scheme`) pada peluncuran pertama dan tersimpan di `localStorage`. Di lingkungan Android, `NativeBridge` secara dinamis mengatur ikon status bar dan navigation bar (`isAppearanceLightStatusBars`, `isAppearanceLightNavigationBars`).

### 3. Ekspor Gambar & Teks (Organizer & Lokasi)
- Format ekspor kartu gambar (PNG) dan teks ringkasan menyertakan informasi **Organizer** dan **Lokasi turnamen**.
- Kanvas ekspor mengukur dimensi teks secara presisi (`measureText`) dan memotong teks panjang secara proporsional dengan elipsis (`…`) agar pas dalam batas kartu 1000px tanpa terpotong.

### 4. Server reset password (Google Apps Script)
- **Fungsi:** Menangani permintaan reset password dengan PIN (`resetWithPin`), penukaran kode reset darurat (`resetWithCode`), dan pembuatan kode reset oleh Admin (`createResetCode`) secara aman di sisi server tanpa menyimpan kunci privat di klien. Koleksi internal `resetGuards` dan `resetCodes` ditolak total pada `firestore.rules`.
- **Lokasi Sumber:** Skrip server berada di direktori `server/reset-password/` (`Code.gs` dan `appsscript.json`).
- **Keamanan Akses:** Karena Web App berjalan dengan hak akses pemilik proyek Firebase, akses edit proyek Google Apps Script harus dibatasi hanya kepada pemilik proyek yang berwenang.
- **Pembaruan Deployment:** Jika mengubah skrip di Google Apps Script, perbarui lewat **Deploy > Kelola deployment > Edit (ikon pensil) > Versi baru** agar alamat endpoint tetap sama dan aplikasi yang sudah terpasang tetap kompatibel.

