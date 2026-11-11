import test from 'node:test';
import assert from 'node:assert/strict';

import {
  aggregateHistoryPlayers,
  markAlreadyRegisteredPlayers,
  filterCandidatesByName,
  preparePlayersToAdd
} from '../utils/playerHistoryImportLogic.ts';

import {
  generateStandingsCsv,
  generateStandingsText
} from '../utils/deckExportLogic.ts';

test('PERUBAHAN 1: aggregateHistoryPlayers menggabungkan duplikat akun berdasarkan UID', () => {
  const participations = [
    {
      id: 't1_u1',
      tournamentId: 't1',
      tournamentName: 'Digimon Cup 1',
      date: '2026-10-10',
      format: 'BO3',
      playerId: 'u1',
      uid: 'u1',
      organizerId: 'org1',
      name: 'Taichi Yagami',
      rank: 1,
      wins: 3,
      losses: 0,
      gamesWon: 6,
      gamesLost: 1,
      points: 9,
      omw: 60,
      gw: 80,
      ogw: 50,
      createdAt: 1000
    },
    {
      id: 't2_u1',
      tournamentId: 't2',
      tournamentName: 'Digimon Cup 2',
      date: '2026-11-01',
      format: 'BO3',
      playerId: 'u1',
      uid: 'u1',
      organizerId: 'org1',
      name: 'Taichi (WarGrey)', // Nama diperbarui di turnamen kedua
      rank: 2,
      wins: 2,
      losses: 1,
      gamesWon: 5,
      gamesLost: 3,
      points: 6,
      omw: 55,
      gw: 65,
      ogw: 52,
      createdAt: 2000
    }
  ];

  const candidates = aggregateHistoryPlayers(participations);
  assert.equal(candidates.length, 1, 'Harus digabungkan menjadi 1 kandidat');
  assert.equal(candidates[0].uid, 'u1');
  assert.equal(candidates[0].isManual, false);
  assert.equal(candidates[0].tournamentsCount, 2, 'Harus mencatat 2 turnamen');
  assert.equal(candidates[0].lastTournamentDate, '2026-11-01');
  assert.equal(candidates[0].name, 'Taichi (WarGrey)', 'Harus menggunakan nama terbaru');
});

test('PERUBAHAN 1: aggregateHistoryPlayers menggabungkan pemain manual berdasarkan nama case-insensitive', () => {
  const participations = [
    {
      id: 't1_m1',
      tournamentId: 't1',
      tournamentName: 'Toko A',
      date: '2026-10-01',
      format: 'BO1',
      playerId: 'm1',
      uid: null,
      organizerId: 'org1',
      name: 'Yamato Ishida',
      rank: 3,
      wins: 1,
      losses: 2,
      gamesWon: 1,
      gamesLost: 2,
      points: 3,
      omw: 40,
      gw: 33,
      ogw: 45,
      createdAt: 500
    },
    {
      id: 't2_m2',
      tournamentId: 't2',
      tournamentName: 'Toko B',
      date: '2026-10-20',
      format: 'BO1',
      playerId: 'm2',
      uid: null,
      organizerId: 'org1',
      name: 'YAMATO ISHIDA', // Variasi huruf besar
      rank: 1,
      wins: 3,
      losses: 0,
      gamesWon: 3,
      gamesLost: 0,
      points: 9,
      omw: 65,
      gw: 100,
      ogw: 55,
      createdAt: 1500
    }
  ];

  const candidates = aggregateHistoryPlayers(participations);
  assert.equal(candidates.length, 1, 'Pemain manual dengan nama sama harus digabung');
  assert.equal(candidates[0].uid, null);
  assert.equal(candidates[0].isManual, true);
  assert.equal(candidates[0].tournamentsCount, 2);
  assert.equal(candidates[0].lastTournamentDate, '2026-10-20');
});

test('PERUBAHAN 1: markAlreadyRegisteredPlayers menandai peserta yang sudah terdaftar di turnamen', () => {
  const candidates = [
    {
      id: 'uid:u1',
      name: 'Taichi Yagami',
      uid: 'u1',
      isManual: false,
      tournamentsCount: 2,
      lastTournamentDate: '2026-11-01',
      lastTournamentTimestamp: 2000
    },
    {
      id: 'uid:u2',
      name: 'Koushiro Izumi',
      uid: 'u2',
      isManual: false,
      tournamentsCount: 1,
      lastTournamentDate: '2026-10-15',
      lastTournamentTimestamp: 1200
    },
    {
      id: 'name:yamato ishida',
      name: 'Yamato Ishida',
      uid: null,
      isManual: true,
      tournamentsCount: 1,
      lastTournamentDate: '2026-10-01',
      lastTournamentTimestamp: 500
    },
    {
      id: 'name:sora takenouchi',
      name: 'Sora Takenouchi',
      uid: null,
      isManual: true,
      tournamentsCount: 1,
      lastTournamentDate: '2026-10-05',
      lastTournamentTimestamp: 800
    }
  ];

  const currentPlayers = [
    {
      id: 'u1',
      name: 'Taichi Yagami',
      uid: 'u1',
      manual: false,
      status: 'accepted',
      joinedAt: 3000
    },
    {
      id: 'm_manual_yamato',
      name: 'yamato ishida', // case-insensitive match
      uid: null,
      manual: true,
      status: 'waiting',
      joinedAt: 3100
    }
  ];

  const marked = markAlreadyRegisteredPlayers(candidates, currentPlayers);

  // Taichi Yagami (UID cocok) -> sudah terdaftar
  const cTaichi = marked.find((c) => c.uid === 'u1');
  assert.equal(cTaichi.isAlreadyRegistered, true);

  // Koushiro (belum ada di turnamen) -> belum terdaftar
  const cKoushiro = marked.find((c) => c.uid === 'u2');
  assert.equal(cKoushiro.isAlreadyRegistered, false);

  // Yamato Ishida (Nama manual cocok) -> sudah terdaftar
  const cYamato = marked.find((c) => c.name.toLowerCase() === 'yamato ishida');
  assert.equal(cYamato.isAlreadyRegistered, true);

  // Sora Takenouchi (belum ada) -> belum terdaftar
  const cSora = marked.find((c) => c.name.toLowerCase() === 'sora takenouchi');
  assert.equal(cSora.isAlreadyRegistered, false);
});

test('PERUBAHAN 1: filterCandidatesByName memfilter kandidat berdasarkan pencarian', () => {
  const candidates = [
    { id: '1', name: 'Agumon Master', uid: 'u1', isManual: false, tournamentsCount: 1, lastTournamentDate: '', lastTournamentTimestamp: 0 },
    { id: '2', name: 'Gabumon Fan', uid: 'u2', isManual: false, tournamentsCount: 1, lastTournamentDate: '', lastTournamentTimestamp: 0 },
    { id: '3', name: 'Agu Champion', uid: null, isManual: true, tournamentsCount: 1, lastTournamentDate: '', lastTournamentTimestamp: 0 }
  ];

  const filtered = filterCandidatesByName(candidates, 'agu');
  assert.equal(filtered.length, 2);
  assert.equal(filtered[0].name, 'Agumon Master');
  assert.equal(filtered[1].name, 'Agu Champion');

  const emptyFilter = filterCandidatesByName(candidates, '');
  assert.equal(emptyFilter.length, 3);
});

test('PERUBAHAN 1: preparePlayersToAdd menyiapkan payload berakun dengan UID asli dan manual dengan ID m_', () => {
  const toAdd = [
    {
      id: 'uid:u1',
      name: 'Taichi Yagami',
      uid: 'u1',
      isManual: false,
      tournamentsCount: 2,
      lastTournamentDate: '2026-11-01',
      lastTournamentTimestamp: 2000
    },
    {
      id: 'name:mimi tachikawa',
      name: 'Mimi Tachikawa',
      uid: null,
      isManual: true,
      tournamentsCount: 1,
      lastTournamentDate: '2026-10-01',
      lastTournamentTimestamp: 500
    }
  ];

  const payloads = preparePlayersToAdd(toAdd, 1700000000000);
  assert.equal(payloads.length, 2);

  // 1. Akun
  assert.equal(payloads[0].id, 'u1');
  assert.equal(payloads[0].uid, 'u1');
  assert.equal(payloads[0].name, 'Taichi Yagami');
  assert.equal(payloads[0].manual, false);
  assert.equal(payloads[0].status, 'accepted');

  // 2. Manual
  assert.ok(payloads[1].id.startsWith('m_'));
  assert.equal(payloads[1].uid, null);
  assert.equal(payloads[1].name, 'Mimi Tachikawa');
  assert.equal(payloads[1].manual, true);
  assert.equal(payloads[1].status, 'accepted');
});

test('PERUBAHAN 2: generateStandingsCsv menampilkan header W/L bukan Menang/Kalah', () => {
  const sampleParts = [
    {
      id: 't1_p1',
      tournamentId: 't1',
      tournamentName: 'Toko Kartu',
      date: '2026-11-10',
      format: 'BO3',
      playerId: 'u1',
      uid: 'u1',
      name: 'Taichi',
      rank: 1,
      wins: 3,
      losses: 0,
      gamesWon: 6,
      gamesLost: 1,
      points: 9,
      omw: 66.7,
      gw: 85.7,
      ogw: 60.0
    }
  ];

  const csv = generateStandingsCsv('Toko Kartu', sampleParts);

  // Pastikan header baru ada
  assert.ok(csv.includes('Match W'), 'CSV harus menyertakan Match W');
  assert.ok(csv.includes('Match L'), 'CSV harus menyertakan Match L');
  assert.ok(csv.includes('Game Win'), 'CSV harus menyertakan Game Win');
  assert.ok(csv.includes('Game Lose'), 'CSV harus menyertakan Game Lose');

  // Pastikan header lama tidak ada
  assert.ok(!csv.includes('Menang Match'), 'CSV tidak boleh lagi memuat Menang Match');
  assert.ok(!csv.includes('Kalah Match'), 'CSV tidak boleh lagi memuat Kalah Match');
});

test('PERUBAHAN 2: generateStandingsText menampilkan singkatan W-L', () => {
  const sampleParts = [
    {
      id: 't1_p1',
      tournamentId: 't1',
      tournamentName: 'Toko Kartu',
      date: '2026-11-10',
      format: 'BO3',
      playerId: 'u1',
      uid: 'u1',
      name: 'Taichi',
      rank: 1,
      wins: 3,
      losses: 0,
      gamesWon: 6,
      gamesLost: 1,
      points: 9,
      omw: 66.7,
      gw: 85.7,
      ogw: 60.0
    }
  ];

  const text = generateStandingsText('Toko Kartu', '2026-11-10', 'BO3', sampleParts);
  assert.ok(text.includes('W-L: 3-0'), 'Teks ekspor harus memuat format W-L: 3-0');
  assert.ok(!text.includes('M-K:'), 'Teks ekspor tidak boleh memuat M-K:');
});
