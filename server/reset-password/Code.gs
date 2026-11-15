/**
 * DigiSwiss-Reset — server reset password (Google Apps Script, web app)
 * Jalur 1: reset dengan PIN 6 digit.  Jalur 2: reset dengan kode darurat dari admin.
 * Skrip berjalan sebagai pemilik proyek Firebase. JANGAN membagikan akses edit skrip ini.
 */
const PROJECT_ID = 'digiswiss-round';
const FIREBASE_API_KEY = 'AIzaSyDY0iUVKWFc9fXvUglGwczPuD5D0nkEa6U'; // apiKey web (publik) dari firebaseConfig.ts
const EMAIL_DOMAIN = '@digiswiss.app';

const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;
const CODE_DEFAULT_MIN = 60;
const CODE_MAX_MIN = 1440;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 karakter
const CODE_LENGTH = 10;
const PIN_MAX_ITERATIONS = 500000;
const ADMIN_TOKEN_MAX_AGE_SEC = 300;
const ADMIN_CODES_PER_HOUR = 20;

const FS_BASE = 'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID + '/databases/(default)/documents';
const IDT_BASE = 'https://identitytoolkit.googleapis.com/v1/projects/' + PROJECT_ID;

// ============================ ENTRY POINT ============================

function doGet() {
  return out_({ ok: true, service: 'digiswiss-reset' });
}

function doPost(e) {
  let req;
  try {
    const raw = (e && e.postData && e.postData.contents) || '';
    if (!raw || raw.length > 4096) return out_(fail_('bad_request', 'Permintaan tidak valid.'));
    req = JSON.parse(raw);
  } catch (err) {
    return out_(fail_('bad_request', 'Permintaan tidak valid.'));
  }
  return out_(handle_(req));
}

function handle_(req) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
  } catch (e) {
    return fail_('busy', 'Server sedang sibuk. Coba lagi sebentar lagi.');
  }
  try {
    if (!req || typeof req !== 'object') return fail_('bad_request', 'Permintaan tidak valid.');
    switch (req.action) {
      case 'resetWithPin': return resetWithPin_(req);
      case 'resetWithCode': return resetWithCode_(req);
      case 'createResetCode': return createResetCode_(req);
      default: return fail_('bad_request', 'Permintaan tidak valid.');
    }
  } catch (err) {
    Logger.log('Galat server: ' + (err && err.message));
    return fail_('server_error', 'Terjadi kesalahan server. Coba lagi nanti.');
  } finally {
    lock.releaseLock();
  }
}

// ============================ JALUR 1: PIN ============================

function resetWithPin_(req) {
  const username = normUser_(req.username);
  const pin = String(req.pin || '').trim();
  const newPassword = String(req.newPassword || '');
  if (!/^[a-z0-9._]{3,20}$/.test(username) || !/^\d{6}$/.test(pin)) {
    return fail_('bad_request', 'Data tidak valid.');
  }
  const pwErr = validateNewPassword_(newPassword, username);
  if (pwErr) return fail_('weak_password', pwErr);

  const uid = findUid_(username);
  const guard = guardFor_(uid, username, 'pin');
  const lockedUntil = guardLockedUntil_(guard);
  if (lockedUntil) return lockedResponse_(lockedUntil);

  let ok = false;
  if (uid) {
    const user = fsRead_('users/' + uid);
    const pinDoc = fsRead_('userPins/' + uid);
    if (isEligibleUser_(user, username) && pinDoc && pinDoc.hash && pinDoc.salt) {
      ok = verifyPin_(pin, pinDoc);
    } else {
      dummyHash_(pin);
    }
  } else {
    dummyHash_(pin);
  }

  if (!ok) return failedAttemptResponse_(guard);

  const user = fsRead_('users/' + uid);
  setPassword_(uid, newPassword);
  guardClear_(guard);
  auditLog_(uid, user.displayName || username, 'PASSWORD_RESET_BY_PIN', 'users/' + uid, null, 'Password direset lewat PIN');
  return { ok: true, mode: 'pin', needsNewPin: false };
}

// ====================== JALUR 2: KODE DARURAT ADMIN ======================

function resetWithCode_(req) {
  const username = normUser_(req.username);
  const code = String(req.code || '').trim().toUpperCase();
  const newPassword = String(req.newPassword || '');
  if (!/^[a-z0-9._]{3,20}$/.test(username) || code.length !== CODE_LENGTH || !/^[A-Z2-9]+$/.test(code)) {
    return fail_('bad_request', 'Data tidak valid.');
  }
  const pwErr = validateNewPassword_(newPassword, username);
  if (pwErr) return fail_('weak_password', pwErr);

  const uid = findUid_(username);
  const guard = guardFor_(uid, username, 'code');
  const lockedUntil = guardLockedUntil_(guard);
  if (lockedUntil) return lockedResponse_(lockedUntil);

  let ok = false;
  let codeDoc = null;
  if (uid) {
    const user = fsRead_('users/' + uid);
    codeDoc = fsRead_('resetCodes/' + uid);
    const valid = isEligibleUser_(user, username) && codeDoc && codeDoc.codeHash && codeDoc.salt &&
      Number(codeDoc.expiresAt) > Date.now() && Number(codeDoc.attempts || 0) < MAX_ATTEMPTS;
    if (valid) {
      ok = safeEqual_(hmacB64_(code, codeDoc.salt), codeDoc.codeHash);
      if (!ok) {
        fsPatch_('resetCodes/' + uid, { attempts: Number(codeDoc.attempts || 0) + 1 }, ['attempts']);
      }
    }
  }

  if (!ok) return failedAttemptResponse_(guard);

  const user = fsRead_('users/' + uid);
  setPassword_(uid, newPassword);
  fsDelete_('userPins/' + uid);   // PIN lama dihapus; pengguna membuat PIN baru saat login
  fsDelete_('resetCodes/' + uid); // kode sekali pakai
  guardClear_(guard);
  auditLog_(uid, user.displayName || username, 'PASSWORD_RESET_BY_ADMIN_CODE', 'users/' + uid, null,
    'Password direset lewat kode darurat dari ' + (codeDoc.createdByName || 'admin'));
  return { ok: true, mode: 'code', needsNewPin: true };
}

function createResetCode_(req) {
  const username = normUser_(req.username);
  const minutes = Math.min(Math.max(parseInt(req.minutes, 10) || CODE_DEFAULT_MIN, 5), CODE_MAX_MIN);
  if (!/^[a-z0-9._]{3,20}$/.test(username) || typeof req.idToken !== 'string' || req.idToken.length < 50) {
    return fail_('bad_request', 'Data tidak valid.');
  }

  // 1. Verifikasi token admin (valid di Firebase dan baru saja login/re-otentikasi)
  const adminUid = verifyIdToken_(req.idToken);
  if (!adminUid) return fail_('unauthorized', 'Sesi admin tidak valid. Masuk ulang lalu coba lagi.');
  const admin = fsRead_('users/' + adminUid);
  if (!admin || admin.role !== 'admin' || admin.active !== true) {
    return fail_('unauthorized', 'Hanya admin yang dapat membuat kode darurat.');
  }

  // 2. Batasi jumlah kode per admin per jam
  const cache = CacheService.getScriptCache();
  const ck = 'cc:' + adminUid;
  const used = parseInt(cache.get(ck) || '0', 10);
  if (used >= ADMIN_CODES_PER_HOUR) return fail_('rate_limited', 'Terlalu banyak kode dibuat. Coba lagi nanti.');
  cache.put(ck, String(used + 1), 3600);

  // 3. Target harus akun aktif non-admin
  const uid = findUid_(username);
  const target = uid ? fsRead_('users/' + uid) : null;
  if (!uid || !isEligibleUser_(target, username)) {
    return fail_('not_found', 'Akun tidak ditemukan atau tidak dapat direset lewat kode (akun admin dilindungi).');
  }

  // 4. Buat kode acak dan simpan hanya hash-nya
  const code = randomCode_();
  const salt = randomSalt_();
  const expiresAt = Date.now() + minutes * 60 * 1000;
  fsSet_('resetCodes/' + uid, {
    codeHash: hmacB64_(code, salt),
    salt: salt,
    expiresAt: expiresAt,
    attempts: 0,
    createdBy: adminUid,
    createdByName: admin.displayName || admin.username || 'admin',
    createdAt: Date.now()
  });
  auditLog_(adminUid, admin.displayName || admin.username || 'admin', 'RESET_CODE_CREATED', 'users/' + uid,
    null, 'Kode darurat dibuat untuk @' + username + ' (berlaku ' + minutes + ' menit)');
  return { ok: true, code: code, expiresAt: expiresAt, minutes: minutes };
}

// ============================ VALIDASI & AKUN ============================

function normUser_(v) {
  return String(v || '').trim().toLowerCase();
}

function validateNewPassword_(pw, username) {
  if (pw.length < 8) return 'Password baru minimal 8 karakter.';
  if (pw.length > 128) return 'Password baru terlalu panjang.';
  if (pw.toLowerCase().indexOf(username) !== -1) return 'Password baru tidak boleh memuat username.';
  if (pw.toLowerCase() === 'dssadmin') return 'Password baru tidak boleh menggunakan password bawaan.';
  return null;
}

function isEligibleUser_(user, username) {
  return !!user && user.active === true && user.role !== 'admin' && user.username === username && username !== 'admindss';
}

function findUid_(username) {
  const r = api_('post', IDT_BASE + '/accounts:lookup', { email: [username + EMAIL_DOMAIN] });
  if (r.code !== 200 || !r.body.users || !r.body.users.length) return null;
  return r.body.users[0].localId;
}

function setPassword_(uid, password) {
  const r = api_('post', IDT_BASE + '/accounts:update', { localId: uid, password: password });
  if (r.code !== 200) throw new Error('Gagal mengatur password (HTTP ' + r.code + ')');
  // Cabut sesi lama di perangkat lain (upaya terbaik; kegagalan tidak membatalkan reset)
  try {
    api_('post', IDT_BASE + '/accounts:update', { localId: uid, validSince: String(Math.floor(Date.now() / 1000)) });
  } catch (e) {
    Logger.log('Pencabutan sesi gagal: ' + (e && e.message));
  }
}

function verifyIdToken_(idToken) {
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;
  let payload;
  try {
    payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[1])).getDataAsString());
  } catch (e) {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (!payload || payload.aud !== PROJECT_ID || !payload.auth_time || now - payload.auth_time > ADMIN_TOKEN_MAX_AGE_SEC) {
    return null;
  }
  const r = api_('post', 'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FIREBASE_API_KEY,
    { idToken: idToken }, true);
  if (r.code !== 200 || !r.body.users || !r.body.users.length) return null;
  return r.body.users[0].localId;
}

// ============================ GUARD PERCOBAAN ============================
// Akun yang ada: dicatat di Firestore (resetGuards, hanya server). Akun yang tidak ada: di cache,
// dengan perilaku sama supaya keberadaan username tidak bisa ditebak.

function guardFor_(uid, username, kind) {
  return uid ? { fsId: uid + '_' + kind } : { cacheKey: 'rg:' + kind + ':' + username };
}

function guardRead_(g) {
  if (g.fsId) {
    const d = fsRead_('resetGuards/' + g.fsId) || {};
    return { failedAttempts: Number(d.failedAttempts || 0), lockedUntil: Number(d.lockedUntil || 0) };
  }
  const raw = CacheService.getScriptCache().get(g.cacheKey);
  return raw ? JSON.parse(raw) : { failedAttempts: 0, lockedUntil: 0 };
}

function guardWrite_(g, state) {
  if (g.fsId) {
    fsSet_('resetGuards/' + g.fsId, { failedAttempts: state.failedAttempts, lockedUntil: state.lockedUntil });
  } else {
    CacheService.getScriptCache().put(g.cacheKey, JSON.stringify(state), 3600);
  }
}

function guardClear_(g) {
  if (g.fsId) fsDelete_('resetGuards/' + g.fsId);
  else CacheService.getScriptCache().remove(g.cacheKey);
}

function guardLockedUntil_(g) {
  const s = guardRead_(g);
  return s.lockedUntil > Date.now() ? s.lockedUntil : 0;
}

function failedAttemptResponse_(g) {
  const s = guardRead_(g);
  s.failedAttempts += 1;
  if (s.failedAttempts >= MAX_ATTEMPTS) {
    s.failedAttempts = 0;
    s.lockedUntil = Date.now() + LOCK_MS;
    guardWrite_(g, s);
    return lockedResponse_(s.lockedUntil);
  }
  guardWrite_(g, s);
  const remaining = MAX_ATTEMPTS - s.failedAttempts;
  return { ok: false, code: 'mismatch', message: 'Data tidak cocok. Sisa percobaan: ' + remaining + '.', remainingAttempts: remaining };
}

function lockedResponse_(lockedUntil) {
  const mins = Math.max(1, Math.ceil((lockedUntil - Date.now()) / 60000));
  return { ok: false, code: 'locked', message: 'Terlalu banyak percobaan. Coba lagi dalam ' + mins + ' menit.', lockedUntil: lockedUntil };
}

// ============================ KRIPTOGRAFI ============================

function verifyPin_(pin, pinDoc) {
  const iterations = Number(pinDoc.iterations || 150000);
  if (!(iterations >= 1000 && iterations <= PIN_MAX_ITERATIONS)) return false;
  const salt = unsigned_(Utilities.base64Decode(pinDoc.salt));
  const derived = pbkdf2Sha256_(strBytes_(pin), salt, iterations);
  return safeEqual_(b64FromUnsigned_(derived), String(pinDoc.hash));
}

function dummyHash_(pin) {
  pbkdf2Sha256_(strBytes_(pin), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], 150000);
}

function hmacB64_(value, key) {
  return Utilities.base64Encode(Utilities.computeHmacSha256Signature(value, key));
}

function safeEqual_(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function randomBytes_(n) {
  const seed = Utilities.getUuid() + Utilities.getUuid() + Date.now() + Math.random();
  const d = unsigned_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, seed));
  return d.slice(0, n);
}

function randomCode_() {
  const b = randomBytes_(CODE_LENGTH);
  let s = '';
  for (let i = 0; i < b.length; i++) s += CODE_ALPHABET.charAt(b[i] & 31);
  return s;
}

function randomSalt_() {
  return b64FromUnsigned_(randomBytes_(16));
}

function strBytes_(s) { // PIN hanya ASCII
  const out = [];
  for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 255);
  return out;
}

function unsigned_(bytes) {
  const o = [];
  for (let i = 0; i < bytes.length; i++) o.push(bytes[i] & 255);
  return o;
}

function b64FromUnsigned_(bytes) {
  const signed = [];
  for (let i = 0; i < bytes.length; i++) signed.push(bytes[i] > 127 ? bytes[i] - 256 : bytes[i]);
  return Utilities.base64Encode(signed);
}

// ---- PBKDF2-HMAC-SHA256 murni JS (Apps Script tidak punya PBKDF2 bawaan) ----

const SHA_K_ = new Int32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);
const SHA_IV_ = [0x6a09e667 | 0, 0xbb67ae85 | 0, 0x3c6ef372 | 0, 0xa54ff53a | 0, 0x510e527f | 0, 0x9b05688c | 0, 0x1f83d9ab | 0, 0x5be0cd19 | 0];
const SHA_W_ = new Int32Array(64);

function sha256Compress_(state, block, out) {
  const w = SHA_W_;
  let i;
  for (i = 0; i < 16; i++) w[i] = block[i];
  for (i = 16; i < 64; i++) {
    const x = w[i - 15], y = w[i - 2];
    const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
    const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
    w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
  }
  let a = state[0], b = state[1], c = state[2], d = state[3], e = state[4], f = state[5], g = state[6], h = state[7];
  for (i = 0; i < 64; i++) {
    const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
    const ch = (e & f) ^ (~e & g);
    const t1 = (h + S1 + ch + SHA_K_[i] + w[i]) | 0;
    const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
    const maj = (a & b) ^ (a & c) ^ (b & c);
    const t2 = (S0 + maj) | 0;
    h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
  }
  out[0] = (state[0] + a) | 0; out[1] = (state[1] + b) | 0; out[2] = (state[2] + c) | 0; out[3] = (state[3] + d) | 0;
  out[4] = (state[4] + e) | 0; out[5] = (state[5] + f) | 0; out[6] = (state[6] + g) | 0; out[7] = (state[7] + h) | 0;
  return out;
}

function wordsFromBytes_(bytes, offset, count) {
  const w = [];
  for (let i = 0; i < count; i++) {
    const p = offset + i * 4;
    w.push(((bytes[p] << 24) | (bytes[p + 1] << 16) | (bytes[p + 2] << 8) | bytes[p + 3]) | 0);
  }
  return w;
}

// Hash pesan `msg` melanjutkan dari `state` yang sudah memproses `prefixLen` byte.
function sha256FromState_(state, msg, prefixLen) {
  const total = prefixLen + msg.length;
  const padded = msg.slice();
  padded.push(0x80);
  while ((padded.length % 64) !== 56) padded.push(0);
  const bits = total * 8;
  padded.push(0, 0, 0, 0, (bits >>> 24) & 255, (bits >>> 16) & 255, (bits >>> 8) & 255, bits & 255);
  let st = state.slice();
  for (let off = 0; off < padded.length; off += 64) {
    st = sha256Compress_(st, wordsFromBytes_(padded, off, 16), new Array(8)).slice();
  }
  return st;
}

function pbkdf2Sha256_(passBytes, saltBytes, iterations) {
  if (passBytes.length > 64) throw new Error('Kunci terlalu panjang');
  const ipad = [], opad = [];
  for (let i = 0; i < 64; i++) {
    const kb = i < passBytes.length ? passBytes[i] : 0;
    ipad.push(kb ^ 0x36);
    opad.push(kb ^ 0x5c);
  }
  const innerState = sha256Compress_(SHA_IV_, wordsFromBytes_(ipad, 0, 16), new Array(8)).slice();
  const outerState = sha256Compress_(SHA_IV_, wordsFromBytes_(opad, 0, 16), new Array(8)).slice();

  // U1 = HMAC(P, salt || INT(1))
  const msg = saltBytes.slice();
  msg.push(0, 0, 0, 1);
  const innerDigest = sha256FromState_(innerState, msg, 64);
  const block = new Int32Array(16);
  const tmp = new Array(8);
  let u = new Array(8);
  for (let i = 0; i < 8; i++) block[i] = innerDigest[i];
  block[8] = 0x80000000 | 0; block[15] = 768;
  sha256Compress_(outerState, block, u);
  const acc = u.slice();

  const inner = new Array(8);
  for (let it = 1; it < iterations; it++) {
    for (let i = 0; i < 8; i++) block[i] = u[i];
    block[8] = 0x80000000 | 0; block[15] = 768;
    sha256Compress_(innerState, block, inner);
    for (let i = 0; i < 8; i++) block[i] = inner[i];
    sha256Compress_(outerState, block, u);
    for (let i = 0; i < 8; i++) acc[i] ^= u[i];
  }
  const out = [];
  for (let i = 0; i < 8; i++) out.push((acc[i] >>> 24) & 255, (acc[i] >>> 16) & 255, (acc[i] >>> 8) & 255, acc[i] & 255);
  return out;
}

// ============================ FIRESTORE & API ============================

function api_(method, url, payload, noProjectHeader) {
  const headers = { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() };
  if (!noProjectHeader) headers['x-goog-user-project'] = PROJECT_ID;
  if (noProjectHeader) delete headers.Authorization; // endpoint publik memakai API key
  const res = UrlFetchApp.fetch(url, {
    method: method,
    contentType: 'application/json',
    headers: headers,
    payload: payload ? JSON.stringify(payload) : undefined,
    muteHttpExceptions: true
  });
  const code = res.getResponseCode();
  const text = res.getContentText();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch (e) { body = { raw: text }; }
  return { code: code, body: body };
}

function fsVal_(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return { integerValue: String(Math.floor(v)) };
  return { stringValue: String(v) };
}

function fsFields_(obj) {
  const f = {};
  Object.keys(obj).forEach(function (k) { f[k] = fsVal_(obj[k]); });
  return f;
}

function fsParse_(doc) {
  const out = {};
  if (!doc || !doc.fields) return out;
  Object.keys(doc.fields).forEach(function (k) {
    const v = doc.fields[k];
    if ('stringValue' in v) out[k] = v.stringValue;
    else if ('integerValue' in v) out[k] = Number(v.integerValue);
    else if ('booleanValue' in v) out[k] = v.booleanValue;
    else if ('doubleValue' in v) out[k] = v.doubleValue;
    else out[k] = null;
  });
  return out;
}

function fsRead_(path) {
  const r = api_('get', FS_BASE + '/' + path);
  if (r.code === 404) return null;
  if (r.code !== 200) throw new Error('Firestore GET ' + path + ' HTTP ' + r.code);
  return fsParse_(r.body);
}

function fsSet_(path, obj) { // ganti seluruh dokumen
  const r = api_('patch', FS_BASE + '/' + path, { fields: fsFields_(obj) });
  if (r.code !== 200) throw new Error('Firestore SET ' + path + ' HTTP ' + r.code);
}

function fsPatch_(path, obj, maskFields) { // ubah sebagian field
  const mask = maskFields.map(function (f) { return 'updateMask.fieldPaths=' + encodeURIComponent(f); }).join('&');
  const r = api_('patch', FS_BASE + '/' + path + '?' + mask, { fields: fsFields_(obj) });
  if (r.code !== 200) throw new Error('Firestore PATCH ' + path + ' HTTP ' + r.code);
}

function fsDelete_(path) {
  const r = api_('delete', FS_BASE + '/' + path);
  if (r.code !== 200 && r.code !== 404) Logger.log('Firestore DELETE ' + path + ' HTTP ' + r.code);
}

function auditLog_(actorId, actorName, action, target, oldValue, newValue) {
  try {
    const r = api_('post', FS_BASE + '/auditLogs', {
      fields: fsFields_({
        actorId: actorId, actorName: actorName, action: action, target: target,
        oldValue: oldValue, newValue: newValue, createdAt: Date.now()
      })
    });
    if (r.code !== 200) Logger.log('Audit log gagal HTTP ' + r.code);
  } catch (e) {
    Logger.log('Audit log gagal: ' + (e && e.message));
  }
}

// ============================ UTILITAS RESPONS ============================

function fail_(code, message) {
  return { ok: false, code: code, message: message };
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ============================ UJI DI EDITOR ============================

// Ukur waktu PBKDF2 di Apps Script (harus jauh di bawah 6 menit; idealnya beberapa detik)
function uji_WaktuPbkdf2() {
  const t0 = Date.now();
  pbkdf2Sha256_(strBytes_('841923'), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], 150000);
  Logger.log('PBKDF2 150000 iterasi: ' + (Date.now() - t0) + ' ms');
}

// Uji jalur PIN langsung dari editor (isi PIN akun uji_reset). Tidak mengubah password bila PIN salah.
function uji_ResetPin() {
  const r = handle_({ action: 'resetWithPin', username: 'uji_reset', pin: '123456', newPassword: 'PasswordBaru2026!' });
  Logger.log(JSON.stringify(r));
}
