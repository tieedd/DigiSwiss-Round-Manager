/**
 * DigiSwiss-Notify — pengirim FCM HTTP v1 (Google Apps Script, web app)
 * Berjalan pada paket Spark (tanpa Cloud Functions).
 * Bergantung pada fungsi murni di logic.js dalam proyek Apps Script yang sama.
 */
const PROJECT_ID = 'digiswiss-round';
const FIREBASE_API_KEY = 'AIzaSyDY0iUVKWFc9fXvUglGwczPuD5D0nkEa6U'; // apiKey web dari firebaseConfig.ts

const FS_BASE = 'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID + '/databases/(default)/documents';
const FCM_SEND_URL = 'https://fcm.googleapis.com/v1/projects/' + PROJECT_ID + '/messages:send';

function doGet() {
  return out_({ ok: true, service: 'digiswiss-push-notify' });
}

function doPost(e) {
  let req;
  try {
    const raw = (e && e.postData && e.postData.contents) || '';
    if (!raw || raw.length > 8192) {
      return out_(fail_('bad_request', 'Permintaan tidak valid.'));
    }
    req = JSON.parse(raw);
  } catch (err) {
    return out_(fail_('bad_request', 'Format JSON tidak valid.'));
  }

  try {
    return out_(handlePush_(req, e));
  } catch (err) {
    Logger.log('Galat push server: ' + (err && err.message));
    return out_(fail_('server_error', 'Terjadi kesalahan server notifikasi.'));
  }
}

function handlePush_(req, e) {
  if (!req || typeof req !== 'object') {
    return fail_('bad_request', 'Permintaan tidak valid.');
  }

  const idToken = extractIdToken_(req, e);
  if (!idToken || idToken.length < 50) {
    return fail_('unauthorized', 'Token otentikasi diperlukan.');
  }

  const pushType = String(req.type || '').trim();
  const tournamentId = String(req.tournamentId || '').trim();
  if (!isValidFirestoreId_(tournamentId) || !isAllowedPushType_(pushType)) {
    return fail_('bad_request', 'Tipe atau ID turnamen tidak valid.');
  }

  // (a) Verifikasi Firebase ID Token
  const callerUid = verifyIdToken_(idToken);
  if (!callerUid) {
    return fail_('unauthorized', 'Sesi tidak valid.');
  }

  // (b) Baca profil pemanggil dan pastikan active == true
  const callerUser = fsRead_('users/' + callerUid);
  if (!callerUser || callerUser.active !== true) {
    return fail_('unauthorized', 'Akun tidak aktif atau tidak ditemukan.');
  }

  // Baca turnamen dan dokumen pendukung sesuai tipe
  const tournament = fsRead_('tournaments/' + tournamentId);
  if (!tournament) {
    return fail_('not_found', 'Turnamen tidak ditemukan.');
  }
  tournament.id = tournamentId;

  let match = null;
  if (pushType === PUSH_EVENT_TYPES.SCORE_PENDING || pushType === PUSH_EVENT_TYPES.SCORE_DISPUTED) {
    const matchId = String(req.matchId || '').trim();
    if (!isValidFirestoreId_(matchId)) {
      return fail_('bad_request', 'ID pertandingan tidak valid.');
    }
    match = fsRead_('tournaments/' + tournamentId + '/matches/' + matchId);
    if (!match) {
      return fail_('not_found', 'Pertandingan tidak ditemukan.');
    }
    match.id = matchId;
  }

  // (c) Otorisasi per tipe
  if (!isAuthorizedForPushType({
    pushType: pushType,
    callerUid: callerUid,
    callerUser: callerUser,
    tournament: tournament,
    match: match
  })) {
    return fail_('forbidden', 'Anda tidak berwenang memicu notifikasi ini.');
  }

  // (e) Pembatasan laju per pemanggil + per tipe + per turnamen (maks 10/menit)
  const rl = checkAndConsumeRateLimit(
    CacheService.getScriptCache(),
    callerUid,
    pushType,
    tournamentId,
    Date.now()
  );
  if (!rl.allowed) {
    return fail_('rate_limited', 'Terlalu banyak permintaan notifikasi.');
  }

  // (d) Hitung penerima & pesan di server dari Firestore
  let announcement = null;
  if (pushType === PUSH_EVENT_TYPES.ANNOUNCEMENT && req.announcementId) {
    const annId = String(req.announcementId).trim();
    if (isValidFirestoreId_(annId)) {
      announcement = fsRead_('tournaments/' + tournamentId + '/announcements/' + annId);
    }
  }

  const players = fsList_('tournaments/' + tournamentId + '/players');
  let matches = [];
  if (pushType === PUSH_EVENT_TYPES.ROUND_STARTED) {
    matches = fsList_('tournaments/' + tournamentId + '/matches');
  }

  const targetPlayerIds = Array.isArray(req.playerIds)
    ? req.playerIds.slice(0, 100)
    : undefined;
  const targetPlayerId = typeof req.playerId === 'string' ? req.playerId.trim() : undefined;

  const rawPlan = resolveNotificationPlan({
    pushType: pushType,
    callerUid: callerUid,
    callerName: callerUser.displayName || callerUser.username || 'Pengguna',
    tournamentId: tournamentId,
    tournament: tournament,
    players: players,
    matches: matches,
    match: match,
    announcement: announcement,
    roundNumber: req.roundNumber,
    targetPlayerId: targetPlayerId,
    targetPlayerIds: targetPlayerIds
  });

  if (!rawPlan.length) {
    return { ok: true, sent: 0, skipped: 0, cleaned: 0 };
  }

  // (f) Hormati notifPrefs penerima
  const userDocsByUid = {};
  for (let i = 0; i < rawPlan.length; i++) {
    const recUid = rawPlan[i].recipientUid;
    if (!(recUid in userDocsByUid)) {
      userDocsByUid[recUid] = fsRead_('users/' + recUid);
    }
  }

  const finalPlan = filterNotificationPlanByPrefs(rawPlan, userDocsByUid);
  if (!finalPlan.length) {
    return { ok: true, sent: 0, skipped: rawPlan.length, cleaned: 0 };
  }

  // Kumpulkan seluruh token perangkat penerima (tanpa mencatat token ke log)
  const deliveries = [];
  for (let i = 0; i < finalPlan.length; i++) {
    const item = finalPlan[i];
    const devices = fsList_('users/' + item.recipientUid + '/devices');
    for (let d = 0; d < devices.length; d++) {
      const dev = devices[d];
      if (!dev || typeof dev.token !== 'string' || !dev.token.trim()) continue;
      deliveries.push({
        devicePath: 'users/' + item.recipientUid + '/devices/' + dev.id,
        token: dev.token.trim(),
        item: item
      });
    }
  }

  if (!deliveries.length) {
    return { ok: true, sent: 0, skipped: rawPlan.length - finalPlan.length, cleaned: 0 };
  }

  // Kirim paralel per 50 pesan lewat UrlFetchApp.fetchAll dan bersihkan token kedaluwarsa
  const stats = sendFcmBatches_(deliveries);
  return {
    ok: true,
    sent: stats.sent,
    failed: stats.failed,
    cleaned: stats.cleaned
  };
}

function sendFcmBatches_(deliveries) {
  const oauthToken = ScriptApp.getOAuthToken();
  const batches = chunkArray(deliveries, FCM_BATCH_SIZE);
  let sent = 0;
  let failed = 0;
  let cleaned = 0;

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    const requests = batch.map(function (entry) {
      return {
        url: FCM_SEND_URL,
        method: 'post',
        contentType: 'application/json',
        headers: {
          Authorization: 'Bearer ' + oauthToken,
          'x-goog-user-project': PROJECT_ID
        },
        payload: JSON.stringify(buildFcmDataMessage(entry.token, entry.item)),
        muteHttpExceptions: true
      };
    });

    const responses = UrlFetchApp.fetchAll(requests);
    for (let r = 0; r < responses.length; r++) {
      const res = responses[r];
      const code = res.getResponseCode();
      if (code >= 200 && code < 300) {
        sent += 1;
      } else {
        failed += 1;
        let parsedErr = {};
        try {
          const text = res.getContentText();
          parsedErr = text ? JSON.parse(text) : {};
        } catch (err) {
          parsedErr = {};
        }
        if (shouldDeleteTokenForFcmResponse(code, parsedErr)) {
          fsDelete_(batch[r].devicePath);
          cleaned += 1;
        }
      }
    }
  }

  Logger.log('FCM selesai: terkirim=' + sent + ', gagal=' + failed + ', dibersihkan=' + cleaned);
  return { sent: sent, failed: failed, cleaned: cleaned };
}

// ============================ OTENTIKASI & VALIDASI ============================

function isAllowedPushType_(t) {
  return (
    t === PUSH_EVENT_TYPES.ANNOUNCEMENT ||
    t === PUSH_EVENT_TYPES.ROUND_STARTED ||
    t === PUSH_EVENT_TYPES.SCORE_PENDING ||
    t === PUSH_EVENT_TYPES.SCORE_DISPUTED ||
    t === PUSH_EVENT_TYPES.REGISTRATION_STATUS
  );
}

function isValidFirestoreId_(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id);
}

function extractIdToken_(req, e) {
  if (req && typeof req.idToken === 'string' && req.idToken.trim()) {
    return req.idToken.trim();
  }
  const headers = (e && e.headers) || {};
  const authHeader = headers.Authorization || headers.authorization || '';
  if (typeof authHeader === 'string' && authHeader.indexOf('Bearer ') === 0) {
    return authHeader.slice(7).trim();
  }
  return '';
}

function verifyIdToken_(idToken) {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) return null;
  let payload;
  try {
    payload = JSON.parse(
      Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[1])).getDataAsString()
    );
  } catch (e) {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (
    !payload ||
    payload.aud !== PROJECT_ID ||
    !payload.exp ||
    Number(payload.exp) <= now
  ) {
    return null;
  }
  const r = api_(
    'post',
    'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FIREBASE_API_KEY,
    { idToken: idToken },
    true
  );
  if (r.code !== 200 || !r.body.users || !r.body.users.length) return null;
  return r.body.users[0].localId;
}

// ============================ FIRESTORE REST API ============================

function api_(method, url, payload, noProjectHeader) {
  const headers = { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() };
  if (!noProjectHeader) headers['x-goog-user-project'] = PROJECT_ID;
  if (noProjectHeader) delete headers.Authorization;
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
  try {
    body = text ? JSON.parse(text) : {};
  } catch (e) {
    body = { raw: text };
  }
  return { code: code, body: body };
}

function fsParseValue_(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('doubleValue' in v) return v.doubleValue;
  if ('nullValue' in v) return null;
  if ('mapValue' in v) {
    const out = {};
    const fields = (v.mapValue && v.mapValue.fields) || {};
    Object.keys(fields).forEach(function (k) {
      out[k] = fsParseValue_(fields[k]);
    });
    return out;
  }
  if ('arrayValue' in v) {
    const arr = (v.arrayValue && v.arrayValue.values) || [];
    return arr.map(fsParseValue_);
  }
  return null;
}

function fsParse_(doc) {
  const out = {};
  if (!doc) return out;
  if (typeof doc.name === 'string') {
    const parts = doc.name.split('/');
    out.id = parts[parts.length - 1];
  }
  if (!doc.fields) return out;
  Object.keys(doc.fields).forEach(function (k) {
    out[k] = fsParseValue_(doc.fields[k]);
  });
  return out;
}

function fsRead_(path) {
  const r = api_('get', FS_BASE + '/' + path);
  if (r.code === 404) return null;
  if (r.code !== 200) throw new Error('Firestore GET HTTP ' + r.code);
  return fsParse_(r.body);
}

function fsList_(collectionPath) {
  const docs = [];
  let pageToken = '';
  do {
    let url = FS_BASE + '/' + collectionPath + '?pageSize=200';
    if (pageToken) {
      url += '&pageToken=' + encodeURIComponent(pageToken);
    }
    const r = api_('get', url);
    if (r.code === 404) break;
    if (r.code !== 200) throw new Error('Firestore LIST HTTP ' + r.code);
    const items = (r.body && r.body.documents) || [];
    for (let i = 0; i < items.length; i++) {
      docs.push(fsParse_(items[i]));
    }
    pageToken = (r.body && r.body.nextPageToken) || '';
  } while (pageToken);
  return docs;
}

function fsDelete_(path) {
  const r = api_('delete', FS_BASE + '/' + path);
  if (r.code !== 200 && r.code !== 404) {
    Logger.log('Firestore DELETE HTTP ' + r.code);
  }
}

// ============================ UTILITAS RESPONS ============================

function fail_(code, message) {
  return { ok: false, code: code, message: message };
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
