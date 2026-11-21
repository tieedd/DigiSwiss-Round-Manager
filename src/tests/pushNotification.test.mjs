import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import {
  DEFAULT_NOTIF_PREFS,
  buildDeviceDocPayload,
  buildNotifyPushRequestBody,
  isPushEndpointConfigured,
  normalizeNotifPrefs,
  resolveNotificationTarget,
  shouldPromptNotificationPermission,
  validateDeviceDocPayload,
} from '../utils/pushLogic.ts';

const logicSource = fs.readFileSync(
  path.resolve(process.cwd(), 'server/push-notify/logic.js'),
  'utf8'
);
const cjsModule = { exports: {} };
vm.runInNewContext(logicSource, {
  module: cjsModule,
  exports: cjsModule.exports,
  Date,
  Math,
  JSON,
  String,
  Number,
  Boolean,
  Array,
  Object,
});
const serverLogic = cjsModule.exports;

const {
  PUSH_EVENT_TYPES,
  MAX_RATE_LIMIT_PER_MIN,
  FCM_BATCH_SIZE,
  sanitizeText,
  sanitizePlayerName,
  isNotifEnabledForType,
  checkAndConsumeRateLimit,
  isAuthorizedForPushType,
  resolveNotificationPlan,
  filterNotificationPlanByPrefs,
  chunkArray,
  buildFcmDataMessage,
  shouldDeleteTokenForFcmResponse,
} = serverLogic;

// --- 1. PENENTUAN PENERIMA PER PERISTIWA ---

test('Event 1 (announcement): mengirim hanya ke peserta berakun aktif/waiting, tanpa pemicu, manual, rejected, atau dropped', () => {
  const plan = resolveNotificationPlan({
    pushType: PUSH_EVENT_TYPES.ANNOUNCEMENT,
    callerUid: 'org1',
    callerName: 'Toko Digimon',
    tournamentId: 't1',
    tournament: { id: 't1', name: 'Liga Musim Semi', organizerId: 'org1' },
    announcement: {
      id: 'a1',
      authorName: 'Toko Digimon',
      message: 'Ronde 1 dimulai dalam 10 menit!',
    },
    players: [
      { id: 'org1', uid: 'org1', name: 'Organizer Self', status: 'accepted' },
      { id: 'u1', uid: 'u1', name: 'Agus', status: 'accepted' },
      { id: 'u2', uid: 'u2', name: 'Budi', status: 'waiting' },
      { id: 'u3', uid: 'u3', name: 'Citra', status: 'rejected' },
      { id: 'u4', uid: 'u4', name: 'Dodi', status: 'dropped' },
      { id: 'm_1', uid: null, manual: true, name: 'Tamu Manual', status: 'accepted' },
    ],
  });

  assert.deepEqual(
    Array.from(plan.map((item) => item.recipientUid)),
    ['u1', 'u2']
  );
  assert.equal(plan[0].title, 'Pengumuman Baru • Liga Musim Semi');
  assert.match(plan[0].body, /Toko Digimon: Ronde 1 dimulai dalam 10 menit!/);
});

test('Event 2 (round_started): mengirim ke pemain yang dipasangkan beserta nomor meja (Swiss & Top Cut), tidak ke pemicu atau manual', () => {
  const swissPlan = resolveNotificationPlan({
    pushType: PUSH_EVENT_TYPES.ROUND_STARTED,
    callerUid: 'org1',
    callerName: 'Organizer',
    tournamentId: 't1',
    tournament: { id: 't1', name: 'DigiSwiss Cup', organizerId: 'org1', totalRounds: 3 },
    roundNumber: 2,
    players: [
      { id: 'u1', uid: 'u1', name: 'Pemain Satu', status: 'accepted' },
      { id: 'u2', uid: 'u2', name: 'Pemain Dua', status: 'accepted' },
      { id: 'org1', uid: 'org1', name: 'Organizer Ikut Main', status: 'accepted' },
      { id: 'm_1', uid: null, manual: true, name: 'Manual Player', status: 'accepted' },
    ],
    matches: [
      {
        id: 'match1',
        round: 2,
        table: 4,
        p1Id: 'u1',
        p2Id: 'u2',
        p1Name: 'Pemain Satu',
        p2Name: 'Pemain Dua',
        archived: false,
      },
      {
        id: 'match2',
        round: 2,
        table: 5,
        p1Id: 'org1',
        p2Id: 'm_1',
        p1Name: 'Organizer Ikut Main',
        p2Name: 'Manual Player',
        archived: false,
      },
      {
        id: 'matchOld',
        round: 1,
        table: 1,
        p1Id: 'u1',
        p2Id: 'u2',
        p1Name: 'Pemain Satu',
        p2Name: 'Pemain Dua',
        archived: false,
      },
    ],
  });

  assert.deepEqual(
    Array.from(swissPlan.map((i) => i.recipientUid)),
    ['u1', 'u2']
  );
  assert.equal(swissPlan[0].title, 'Ronde 2 Dimulai • DigiSwiss Cup');
  assert.equal(swissPlan[0].body, 'Meja 4 — Lawan: Pemain Dua');
  assert.equal(swissPlan[1].body, 'Meja 4 — Lawan: Pemain Satu');
  assert.equal(swissPlan[0].matchId, 'match1');

  const topCutPlan = resolveNotificationPlan({
    pushType: PUSH_EVENT_TYPES.ROUND_STARTED,
    callerUid: 'org1',
    callerName: 'Organizer',
    tournamentId: 't1',
    tournament: {
      id: 't1',
      name: 'DigiSwiss Cup',
      organizerId: 'org1',
      totalRounds: 3,
      topCut: { size: 4 },
    },
    roundNumber: 4,
    players: [
      { id: 'u1', uid: 'u1', name: 'Pemain Satu', status: 'accepted' },
      { id: 'u2', uid: 'u2', name: 'Pemain Dua', status: 'accepted' },
    ],
    matches: [
      {
        id: 'tc1',
        round: 4,
        table: 1,
        p1Id: 'u1',
        p2Id: 'u2',
        p1Name: 'Pemain Satu',
        p2Name: 'Pemain Dua',
        archived: false,
      },
    ],
  });
  assert.equal(topCutPlan[0].title, 'Top 4 (Semifinal) Dimulai • DigiSwiss Cup');
  assert.match(topCutPlan[0].body, /Meja 1/);
});

test('Event 3 (score_pending): mengirim hanya ke lawan pertandingan saat status awaiting', () => {
  const plan = resolveNotificationPlan({
    pushType: PUSH_EVENT_TYPES.SCORE_PENDING,
    callerUid: 'u1',
    callerName: 'Agus',
    tournamentId: 't1',
    tournament: { id: 't1', name: 'Turnamen Mingguan', organizerId: 'org1' },
    players: [
      { id: 'u1', uid: 'u1', name: 'Agus', status: 'accepted' },
      { id: 'u2', uid: 'u2', name: 'Budi', status: 'accepted' },
    ],
    match: {
      id: 'm10',
      round: 1,
      table: 3,
      p1Id: 'u1',
      p2Id: 'u2',
      p1Name: 'Agus',
      p2Name: 'Budi',
      p1Score: 2,
      p2Score: 1,
      status: 'awaiting',
      reportedBy: 'u1',
    },
  });

  assert.equal(plan.length, 1);
  assert.equal(plan[0].recipientUid, 'u2');
  assert.equal(plan[0].matchId, 'm10');
  assert.match(plan[0].body, /Agus melaporkan skor Meja 3 \(2-1\)/);
});

test('Event 4 (score_disputed): mengirim hanya ke organizer pemilik turnamen', () => {
  const plan = resolveNotificationPlan({
    pushType: PUSH_EVENT_TYPES.SCORE_DISPUTED,
    callerUid: 'u2',
    callerName: 'Budi',
    tournamentId: 't1',
    tournament: { id: 't1', name: 'Turnamen Mingguan', organizerId: 'org1' },
    match: {
      id: 'm10',
      round: 1,
      table: 3,
      p1Id: 'u1',
      p2Id: 'u2',
      p1Name: 'Agus',
      p2Name: 'Budi',
      status: 'disputed',
    },
  });

  assert.equal(plan.length, 1);
  assert.equal(plan[0].recipientUid, 'org1');
  assert.match(plan[0].body, /Budi menyengketakan skor Meja 3/);
});

test('Event 5 (registration_status): mengirim pemberitahuan accepted atau rejected ke pemain bersangkutan', () => {
  const plan = resolveNotificationPlan({
    pushType: PUSH_EVENT_TYPES.REGISTRATION_STATUS,
    callerUid: 'org1',
    callerName: 'Organizer',
    tournamentId: 't1',
    tournament: { id: 't1', name: 'Turnamen Mingguan', organizerId: 'org1' },
    targetPlayerIds: ['u1', 'u2', 'm_1'],
    players: [
      { id: 'u1', uid: 'u1', name: 'Agus', status: 'accepted' },
      { id: 'u2', uid: 'u2', name: 'Budi', status: 'rejected' },
      { id: 'm_1', uid: null, manual: true, name: 'Manual', status: 'accepted' },
    ],
  });

  assert.equal(plan.length, 2);
  assert.equal(plan[0].recipientUid, 'u1');
  assert.match(plan[0].title, /Pendaftaran Diterima/);
  assert.equal(plan[1].recipientUid, 'u2');
  assert.match(plan[1].title, /Pendaftaran Ditolak/);
});

// --- 2. SANITASI, OTORISASI, RATE LIMIT, DAN PREFERENSI ---

test('Sanitasi nama & teks membuang karakter kontrol/HTML dan memotong sesuai batas', () => {
  assert.equal(sanitizePlayerName('  <script>\nAgus\t\rPratama  ', 15), 'script Agus...');
  assert.equal(sanitizePlayerName('   ', 20), 'Pemain');
  assert.equal(sanitizeText('Halo\n\nDunia   Baru', 12), 'Halo Duni...');
});

test('Otorisasi server per tipe event menegakkan active == true dan peran/kepemilikan', () => {
  const tourney = { id: 't1', organizerId: 'org1' };
  const match = { id: 'm1', p1Id: 'u1', p2Id: 'u2' };

  assert.equal(
    isAuthorizedForPushType({
      pushType: PUSH_EVENT_TYPES.ANNOUNCEMENT,
      callerUid: 'org1',
      callerUser: { active: true, role: 'organizer' },
      tournament: tourney,
    }),
    true
  );
  assert.equal(
    isAuthorizedForPushType({
      pushType: PUSH_EVENT_TYPES.ROUND_STARTED,
      callerUid: 'adm1',
      callerUser: { active: true, role: 'admin' },
      tournament: tourney,
    }),
    true
  );
  assert.equal(
    isAuthorizedForPushType({
      pushType: PUSH_EVENT_TYPES.ROUND_STARTED,
      callerUid: 'u1',
      callerUser: { active: true, role: 'player' },
      tournament: tourney,
    }),
    false
  );
  assert.equal(
    isAuthorizedForPushType({
      pushType: PUSH_EVENT_TYPES.SCORE_PENDING,
      callerUid: 'u2',
      callerUser: { active: true, role: 'player' },
      tournament: tourney,
      match,
    }),
    true
  );
  assert.equal(
    isAuthorizedForPushType({
      pushType: PUSH_EVENT_TYPES.SCORE_DISPUTED,
      callerUid: 'u3',
      callerUser: { active: true, role: 'player' },
      tournament: tourney,
      match,
    }),
    false
  );
  assert.equal(
    isAuthorizedForPushType({
      pushType: PUSH_EVENT_TYPES.SCORE_PENDING,
      callerUid: 'u1',
      callerUser: { active: false, role: 'player' },
      tournament: tourney,
      match,
    }),
    false
  );
});

test('Rate limiter membatasi maksimal 10 permintaan per menit per pemanggil + tipe + turnamen', () => {
  const store = new Map();
  const fakeCache = {
    get: (k) => store.get(k) ?? null,
    put: (k, v) => store.set(k, v),
  };

  const t0 = 1_700_000_000_000;
  for (let i = 0; i < MAX_RATE_LIMIT_PER_MIN; i++) {
    const res = checkAndConsumeRateLimit(fakeCache, 'org1', 'announcement', 't1', t0 + i * 100);
    assert.equal(res.allowed, true);
  }
  const blocked = checkAndConsumeRateLimit(fakeCache, 'org1', 'announcement', 't1', t0 + 5000);
  assert.equal(blocked.allowed, false);

  // Tipe atau turnamen berbeda memiliki kuota terpisah
  const otherType = checkAndConsumeRateLimit(fakeCache, 'org1', 'round_started', 't1', t0 + 5000);
  assert.equal(otherType.allowed, true);

  // Setelah 1 menit berlalu, jendela reset
  const afterWindow = checkAndConsumeRateLimit(fakeCache, 'org1', 'announcement', 't1', t0 + 61_000);
  assert.equal(afterWindow.allowed, true);
});

test('Filter notifPrefs menghormati toggle utama dan per kategori serta default aktif', () => {
  assert.equal(isNotifEnabledForType(undefined, 'announcement'), true);
  assert.equal(isNotifEnabledForType({ enabled: false, announcements: true }, 'announcement'), false);
  assert.equal(isNotifEnabledForType({ enabled: true, rounds: false }, 'round_started'), false);
  assert.equal(isNotifEnabledForType({ enabled: true, scores: false }, 'score_pending'), false);
  assert.equal(isNotifEnabledForType({ enabled: true, scores: false }, 'score_disputed'), false);
  assert.equal(isNotifEnabledForType({ enabled: true, registration: false }, 'registration_status'), false);

  const filtered = filterNotificationPlanByPrefs(
    [
      { recipientUid: 'u1', type: 'round_started', title: 'R2', body: 'Meja 1', tournamentId: 't1' },
      { recipientUid: 'u2', type: 'round_started', title: 'R2', body: 'Meja 1', tournamentId: 't1' },
      { recipientUid: 'u3', type: 'round_started', title: 'R2', body: 'Meja 1', tournamentId: 't1' },
    ],
    {
      u1: { active: true, notifPrefs: { enabled: true, rounds: false } },
      u2: { active: true },
      u3: { active: false },
    }
  );
  assert.deepEqual(
    Array.from(filtered.map((x) => x.recipientUid)),
    ['u2']
  );
});

// --- 3. BATCH FCM, DATA-ONLY, DAN VALIDASI CLIENT ---

test('FCM payload bersifat data-only dengan priority HIGH, batch per 50, dan deteksi token invalid', () => {
  const msg = buildFcmDataMessage('tok_123', {
    title: 'Judul',
    body: 'Isi pesan',
    type: 'round_started',
    tournamentId: 't1',
    matchId: 'm1',
  });
  assert.equal('notification' in msg.message, false);
  assert.equal(msg.message.android.priority, 'HIGH');
  assert.equal(msg.message.data.tournamentId, 't1');

  const chunks = chunkArray(new Array(120).fill(1), FCM_BATCH_SIZE);
  assert.deepEqual(Array.from(chunks.map((c) => c.length)), [50, 50, 20]);

  assert.equal(
    shouldDeleteTokenForFcmResponse(404, {
      error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] },
    }),
    true
  );
  assert.equal(shouldDeleteTokenForFcmResponse(500, { error: { status: 'INTERNAL' } }), false);
});

test('Client request builder hanya mengirim tipe dan ID tanpa recipients/title/body, dan validasi device doc sesuai rules', () => {
  const reqBody = buildNotifyPushRequestBody({
    type: 'score_pending',
    tournamentId: 't1',
    matchId: 'm1',
    recipients: ['evil_uid'],
    title: 'Spoofed Title',
    body: 'Spoofed Body',
  });
  assert.deepEqual(reqBody, {
    type: 'score_pending',
    tournamentId: 't1',
    matchId: 'm1',
  });
  assert.equal(buildNotifyPushRequestBody({ type: 'invalid', tournamentId: 't1' }), null);

  const validDevice = buildDeviceDocPayload('fcm_abc_123', '1.0.0', 1700000000000);
  assert.equal(validateDeviceDocPayload(validDevice).valid, true);
  assert.equal(
    validateDeviceDocPayload({ ...validDevice, extra: true }).valid,
    false
  );
  assert.equal(
    validateDeviceDocPayload({ ...validDevice, platform: 'ios' }).valid,
    false
  );
  assert.equal(
    validateDeviceDocPayload({ ...validDevice, token: '' }).valid,
    false
  );

  assert.equal(isPushEndpointConfigured(''), false);
  assert.equal(isPushEndpointConfigured('https://script.google.com/macros/s/abc/exec'), true);
  assert.deepEqual(normalizeNotifPrefs(null), DEFAULT_NOTIF_PREFS);
  assert.equal(
    shouldPromptNotificationPermission({
      isNativeSupported: true,
      permissionState: 'prompt',
      dismissedPrompt: false,
    }),
    true
  );
  assert.equal(
    resolveNotificationTarget({
      role: 'player',
      pushType: 'round_started',
      tournamentStatus: 'running',
    }).tab,
    'my_matches'
  );
});

// --- 4. VERIFIKASI ATURAN FIRESTORE, SERVER, DAN MANIFEST ANDROID ---

test('firestore.rules mengunci users/{uid}/devices/{deviceId} hanya untuk pemilik aktif dan memvalidasi field', () => {
  const rules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
  assert.equal(rules.includes('match /devices/{deviceId}'), true);
  assert.equal(rules.includes('isValidDeviceDoc(request.resource.data)'), true);
  assert.equal(rules.includes("data.platform == 'android'"), true);
  assert.equal(rules.includes('data.token.size() <= 4096'), true);
  assert.equal(rules.includes('isValidNotifPrefs(request.resource.data.notifPrefs)'), true);
});

test('AndroidManifest.xml, DigiSwissMessagingService.kt, dan server/push-notify terkonfigurasi lengkap', () => {
  const manifest = fs.readFileSync(
    path.resolve(process.cwd(), 'app/src/main/AndroidManifest.xml'),
    'utf8'
  );
  assert.equal(manifest.includes('android.permission.POST_NOTIFICATIONS'), true);
  assert.equal(manifest.includes('com.google.firebase.MESSAGING_EVENT'), true);
  assert.equal(manifest.includes('digiswiss_default'), true);

  const messagingSvc = fs.readFileSync(
    path.resolve(process.cwd(), 'app/src/main/java/com/example/DigiSwissMessagingService.kt'),
    'utf8'
  );
  assert.equal(messagingSvc.includes('isAppInForeground'), true);
  assert.equal(messagingSvc.includes('push-received'), true);
  assert.equal(messagingSvc.includes('notification-opened'), true);

  const gs = fs.readFileSync(
    path.resolve(process.cwd(), 'server/push-notify/Code.gs'),
    'utf8'
  );
  assert.equal(gs.includes('UrlFetchApp.fetchAll'), true);
  assert.equal(gs.includes('projects/'), true);
  assert.equal(gs.includes('Logger.log(token'), false);
});
