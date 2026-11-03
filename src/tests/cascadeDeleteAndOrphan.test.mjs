import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planTournamentDeletion,
  chunkOperations,
  filterParticipationsByExistingTournaments,
  findOrphanParticipations
} from '../utils/cascadeDeleteLogic.ts';

test('CASCADE 1: planTournamentDeletion menyusun urutan (matches -> rounds -> players -> participations -> tournament)', () => {
  const tid = 'tourney_123';
  const plan = planTournamentDeletion(tid, {
    matches: [{ id: 'm1' }, { id: 'm2' }],
    rounds: [{ id: 'r1' }],
    players: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }],
    participations: [{ id: 'part1' }, { id: 'part2' }]
  });

  // Total operasi: 2 matches + 1 round + 3 players + 2 participations + 1 tournament = 9 operasi
  assert.equal(plan.length, 9);

  // 1. Matches pertama
  assert.equal(plan[0].type, 'match');
  assert.equal(plan[0].path, 'tournaments/tourney_123/matches/m1');
  assert.equal(plan[1].type, 'match');
  assert.equal(plan[1].path, 'tournaments/tourney_123/matches/m2');

  // 2. Rounds kedua
  assert.equal(plan[2].type, 'round');
  assert.equal(plan[2].path, 'tournaments/tourney_123/rounds/r1');

  // 3. Players ketiga
  assert.equal(plan[3].type, 'player');
  assert.equal(plan[3].path, 'tournaments/tourney_123/players/p1');
  assert.equal(plan[4].type, 'player');
  assert.equal(plan[4].path, 'tournaments/tourney_123/players/p2');
  assert.equal(plan[5].type, 'player');
  assert.equal(plan[5].path, 'tournaments/tourney_123/players/p3');

  // 4. Participations keempat
  assert.equal(plan[6].type, 'participation');
  assert.equal(plan[6].path, 'participations/part1');
  assert.equal(plan[7].type, 'participation');
  assert.equal(plan[7].path, 'participations/part2');

  // 5. Dokumen turnamen UTAMA SELALU TERAKHIR
  const lastOp = plan[plan.length - 1];
  assert.equal(lastOp.type, 'tournament');
  assert.equal(lastOp.id, 'tourney_123');
  assert.equal(lastOp.path, 'tournaments/tourney_123');
});

test('CASCADE 2: planTournamentDeletion tetap meletakkan turnamen di akhir walau subkoleksi kosong', () => {
  const tid = 'empty_tourney';
  const plan = planTournamentDeletion(tid, {});

  assert.equal(plan.length, 1);
  assert.equal(plan[0].type, 'tournament');
  assert.equal(plan[0].id, 'empty_tourney');
  assert.equal(plan[0].path, 'tournaments/empty_tourney');
});

test('CASCADE 3: chunkOperations membagi operasi dengan batas maksimal 400 dan tanpa kehilangan elemen', () => {
  // Buat 950 operasi dummy
  const dummyOps = Array.from({ length: 950 }, (_, i) => ({ id: `op_${i}` }));

  const chunks = chunkOperations(dummyOps, 400);

  // 950 dibagi 400 menghasilkan 3 potongan: 400 + 400 + 150
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].length, 400);
  assert.equal(chunks[1].length, 400);
  assert.equal(chunks[2].length, 150);

  // Tiap potongan tidak boleh melebihi 400
  for (const chunk of chunks) {
    assert.ok(chunk.length <= 400);
  }

  // Seluruh elemen tetap utuh
  const merged = chunks.flat();
  assert.equal(merged.length, 950);
  assert.equal(merged[0].id, 'op_0');
  assert.equal(merged[949].id, 'op_949');

  // Array kosong menghasilkan []
  assert.deepEqual(chunkOperations([], 400), []);
});

test('CASCADE 4: filterParticipationsByExistingTournaments membuang partisipasi yatim dan mempertahankan turnamen aktif', () => {
  const participations = [
    { id: 'part_1', tournamentId: 'tourney_A', name: 'Player 1' },
    { id: 'part_2', tournamentId: 'tourney_B_deleted', name: 'Player 2' },
    { id: 'part_3', tournamentId: 'tourney_A', name: 'Player 3' },
    { id: 'part_4', tournamentId: 'tourney_C', name: 'Player 4' },
    { id: 'part_5', tournamentId: '', name: 'Player 5' }
  ];

  const existingIds = new Set(['tourney_A', 'tourney_C']);
  const filtered = filterParticipationsByExistingTournaments(participations, existingIds);

  assert.equal(filtered.length, 3);
  assert.deepEqual(
    filtered.map((p) => p.id),
    ['part_1', 'part_3', 'part_4']
  );

  // Mendukung masukan berupa array string
  const filteredWithArray = filterParticipationsByExistingTournaments(participations, [
    'tourney_A',
    'tourney_C'
  ]);
  assert.equal(filteredWithArray.length, 3);

  // Daftar partisipasi kosong
  assert.deepEqual(filterParticipationsByExistingTournaments([], existingIds), []);

  // Tidak ada turnamen yang ada
  assert.deepEqual(filterParticipationsByExistingTournaments(participations, new Set()), []);
});

test('CASCADE 5: findOrphanParticipations mendeteksi dokumen partisipasi dari turnamen yang sudah dihapus', () => {
  const participations = [
    { id: 'part_1', tournamentId: 'tourney_active', name: 'Taichi' },
    { id: 'part_2', tournamentId: 'tourney_deleted_1', name: 'Yamato' },
    { id: 'part_3', tournamentId: 'tourney_deleted_2', name: 'Sora' },
    { id: 'part_4', tournamentId: 'tourney_active', name: 'Koushiro' }
  ];

  const existingIds = new Set(['tourney_active']);
  const orphans = findOrphanParticipations(participations, existingIds);

  assert.equal(orphans.length, 2);
  assert.deepEqual(
    orphans.map((p) => p.id),
    ['part_2', 'part_3']
  );

  // Jika semua turnamen masih ada
  assert.equal(
    findOrphanParticipations(participations, [
      'tourney_active',
      'tourney_deleted_1',
      'tourney_deleted_2'
    ]).length,
    0
  );
});
