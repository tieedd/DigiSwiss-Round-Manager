import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  ANNOUNCEMENT_MAX_LENGTH,
  validateAnnouncementMessage,
  sortAnnouncementsNewestFirst,
  formatRelativeIndonesianTime,
} from '../utils/announcementLogic.ts';
import { planTournamentDeletion } from '../utils/cascadeDeleteLogic.ts';
import {
  filterFinishedLeagueTournaments,
  extractLeagueOrganizers,
  computeLeagueCumulativeStandings,
  generateLeagueCumulativeText,
  generateLeagueCumulativeCsv,
  buildLeagueCumulativeExportFileName,
} from '../utils/leagueCumulativeLogic.ts';

// --- PART C: PENGUMUMAN ORGANIZER ---

test('Part C: validateAnnouncementMessage menolak teks kosong dan teks > 500 karakter', () => {
  assert.equal(validateAnnouncementMessage('').valid, false);
  assert.equal(validateAnnouncementMessage('   \n  ').valid, false);
  assert.equal(
    validateAnnouncementMessage('A'.repeat(ANNOUNCEMENT_MAX_LENGTH + 1)).valid,
    false
  );

  const ok = validateAnnouncementMessage('  Ronde 2 dimulai pukul 14:00 WIB!  ');
  assert.equal(ok.valid, true);
  assert.equal(ok.trimmed, 'Ronde 2 dimulai pukul 14:00 WIB!');

  const exactMax = validateAnnouncementMessage('B'.repeat(ANNOUNCEMENT_MAX_LENGTH));
  assert.equal(exactMax.valid, true);
});

test('Part C: sortAnnouncementsNewestFirst mengurutkan terbaru di atas', () => {
  const list = [
    { id: '1', message: 'Lama', authorId: 'o1', authorName: 'Org', createdAt: 1000, updatedAt: 1000 },
    { id: '3', message: 'Terbaru', authorId: 'o1', authorName: 'Org', createdAt: 3000, updatedAt: 3000 },
    { id: '2', message: 'Tengah', authorId: 'o1', authorName: 'Org', createdAt: 2000, updatedAt: 2000 },
  ];
  const sorted = sortAnnouncementsNewestFirst(list);
  assert.deepEqual(
    sorted.map((a) => a.id),
    ['3', '2', '1']
  );
});

test('Part C: formatRelativeIndonesianTime menghasilkan format waktu relatif Bahasa Indonesia', () => {
  const now = new Date(2026, 10, 20, 12, 0, 0).getTime();
  assert.equal(formatRelativeIndonesianTime(now - 20_000, now), 'Baru saja');
  assert.equal(formatRelativeIndonesianTime(now - 5 * 60_000, now), '5 menit lalu');
  assert.equal(formatRelativeIndonesianTime(now - 2 * 3_600_000, now), '2 jam lalu');
  assert.equal(formatRelativeIndonesianTime(now - 3 * 86_400_000, now), '3 hari lalu');
  assert.equal(
    formatRelativeIndonesianTime(new Date(2026, 10, 1, 10, 0, 0).getTime(), now),
    '01 November 2026'
  );
});

test('Part C: firestore.rules dan planTournamentDeletion mendukung subkoleksi announcements', () => {
  const rules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
  assert.equal(rules.includes('match /announcements/{aid}'), true);

  const ops = planTournamentDeletion('t_liga', {
    players: [{ id: 'p1' }],
    rounds: [{ id: '1' }],
    matches: [{ id: 'm1' }],
    participations: [{ id: 't_liga_p1' }],
    announcements: [{ id: 'a1' }, { id: 'a2' }],
  });
  const announcementOps = ops.filter((op) => op.type === 'announcement');
  assert.equal(announcementOps.length, 2);
  assert.equal(announcementOps[0].path, 'tournaments/t_liga/announcements/a1');
  assert.equal(ops[ops.length - 1].type, 'tournament');
});

// --- PART D: POIN LIGA LINTAS SEASON ---

function makeLeagueTournament(overrides) {
  return {
    id: 't1',
    name: 'Liga Digimon Jakarta',
    date: '2026-09-10',
    location: 'Jakarta',
    format: 'BO3',
    type: 'league',
    season: { number: 1, month: 9, year: 2026 },
    status: 'finished',
    organizerId: 'orgA',
    organizerName: 'Toko Alpha',
    joinCode: 'LG0001',
    createdAt: 1000,
    ...overrides,
  };
}

function makeParticipation(overrides) {
  return {
    id: `${overrides.tournamentId}_${overrides.playerId}`,
    tournamentId: 't1',
    tournamentName: 'Liga Digimon Jakarta',
    date: '2026-09-10',
    format: 'BO3',
    tournamentType: 'league',
    playerId: 'u1',
    uid: 'u1',
    organizerId: 'orgA',
    name: 'Budi',
    rank: 1,
    wins: 4,
    losses: 1,
    gamesWon: 8,
    gamesLost: 3,
    points: 12,
    omw: 60,
    gw: 72.73,
    ogw: 58,
    ...overrides,
  };
}

test('Part D: hanya menjumlahkan Turnamen Liga berstatus finished milik organizer yang sama', () => {
  const tournaments = [
    // Valid finished league orgA Season 1
    makeLeagueTournament({
      id: 'lg1',
      season: { number: 1, month: 9, year: 2026 },
      date: '2026-09-15',
    }),
    // Valid finished league orgA Season 2
    makeLeagueTournament({
      id: 'lg2',
      season: { number: 2, month: 10, year: 2026 },
      date: '2026-10-18',
    }),
    // TIDAK VALID: Liga orgA masih berjalan (running)
    makeLeagueTournament({
      id: 'lg_running',
      status: 'running',
      season: { number: 3, month: 11, year: 2026 },
      date: '2026-11-19',
    }),
    // TIDAK VALID: Turnamen Reguler finished orgA
    makeLeagueTournament({
      id: 'reg_finished',
      name: 'Weekly Reguler',
      type: 'regular',
      season: undefined,
      status: 'finished',
      date: '2026-10-25',
    }),
    // Valid finished league milik organizer berbeda (orgB)
    makeLeagueTournament({
      id: 'lg_orgB',
      organizerId: 'orgB',
      organizerName: 'Toko Beta',
      season: { number: 1, month: 10, year: 2026 },
      date: '2026-10-20',
    }),
  ];

  const finishedOnly = filterFinishedLeagueTournaments(tournaments);
  assert.deepEqual(
    finishedOnly.map((t) => t.id),
    ['lg1', 'lg2', 'lg_orgB']
  );

  const organizers = extractLeagueOrganizers(tournaments);
  assert.equal(organizers.length, 2);
  assert.equal(organizers[0].organizerId, 'orgA');
  assert.equal(organizers[0].tournamentsCount, 2);

  const participations = [
    // Budi ikut Season 1 (12 pts, 4W-1L) dan Season 2 (15 pts, 5W-0L) -> total 27 pts, 9W-1L
    makeParticipation({
      tournamentId: 'lg1',
      playerId: 'u_budi',
      uid: 'u_budi',
      name: 'Budi',
      points: 12,
      wins: 4,
      losses: 1,
      rank: 2,
    }),
    makeParticipation({
      tournamentId: 'lg2',
      playerId: 'u_budi',
      uid: 'u_budi',
      name: 'Budi Santoso', // uji pembaruan nama pada season lebih baru
      points: 15,
      wins: 5,
      losses: 0,
      rank: 1,
      topCutResult: 'Juara',
    }),
    // Citra hanya ikut Season 1 (15 pts, 5W-0L) -> total 15 pts
    makeParticipation({
      tournamentId: 'lg1',
      playerId: 'u_citra',
      uid: 'u_citra',
      name: 'Citra',
      points: 15,
      wins: 5,
      losses: 0,
      rank: 1,
      topCutResult: 'Juara',
    }),
    // Dodi (manual player tanpa uid) ikut Season 2 saja (15 pts, 5W-1L) -> kalah selisih W-L dari Citra (5-0 vs 5-1)
    makeParticipation({
      tournamentId: 'lg2',
      playerId: 'manual_dodi',
      uid: null,
      name: 'Dodi',
      points: 15,
      wins: 5,
      losses: 1,
      rank: 2,
      topCutResult: 'Runner-up',
    }),
    // Partisipasi yang HARUS DIABAIKAN: turnamen running, reguler, dan orgB
    makeParticipation({
      tournamentId: 'lg_running',
      playerId: 'u_citra',
      uid: 'u_citra',
      name: 'Citra',
      points: 99,
      wins: 10,
      losses: 0,
    }),
    makeParticipation({
      tournamentId: 'reg_finished',
      playerId: 'u_citra',
      uid: 'u_citra',
      name: 'Citra',
      points: 50,
      wins: 6,
      losses: 0,
    }),
    makeParticipation({
      tournamentId: 'lg_orgB',
      organizerId: 'orgB',
      playerId: 'u_budi',
      uid: 'u_budi',
      name: 'Budi',
      points: 30,
      wins: 6,
      losses: 0,
    }),
  ];

  const summaryOrgA = computeLeagueCumulativeStandings(tournaments, participations, 'orgA');
  assert.equal(summaryOrgA.tournaments.length, 2);
  assert.equal(summaryOrgA.standings.length, 3);

  // Rank 1: Budi Santoso (27 pts, 9W-1L, 2 season)
  assert.equal(summaryOrgA.standings[0].rank, 1);
  assert.equal(summaryOrgA.standings[0].playerName, 'Budi Santoso');
  assert.equal(summaryOrgA.standings[0].totalPoints, 27);
  assert.equal(summaryOrgA.standings[0].totalWins, 9);
  assert.equal(summaryOrgA.standings[0].totalLosses, 1);
  assert.equal(summaryOrgA.standings[0].seasonsCount, 2);
  assert.equal(summaryOrgA.standings[0].seasonBreakdown[0].seasonLabel, 'SEASON 1 SEPTEMBER 2026');
  assert.equal(summaryOrgA.standings[0].seasonBreakdown[1].seasonLabel, 'SEASON 2 OKTOBER 2026');

  // Rank 2: Citra (15 pts, 5W-0L > Dodi 5W-1L)
  assert.equal(summaryOrgA.standings[1].rank, 2);
  assert.equal(summaryOrgA.standings[1].playerName, 'Citra');
  assert.equal(summaryOrgA.standings[1].totalPoints, 15);

  // Rank 3: Dodi (15 pts, 5W-1L)
  assert.equal(summaryOrgA.standings[2].rank, 3);
  assert.equal(summaryOrgA.standings[2].playerName, 'Dodi');
  assert.equal(summaryOrgA.standings[2].totalPoints, 15);

  // Ekspor teks & CSV & nama berkas
  const fileName = buildLeagueCumulativeExportFileName(summaryOrgA.organizerName, 'png');
  assert.equal(fileName, 'Klasemen-Liga-Lintas-Season-Toko_Alpha.png');

  const textExport = generateLeagueCumulativeText(summaryOrgA, new Date(2026, 10, 20));
  assert.equal(textExport.includes('KLASEMEN POIN LIGA LINTAS SEASON'), true);
  assert.equal(textExport.includes('Organizer: Toko Alpha'), true);
  assert.equal(textExport.includes('20 November 2026'), true);
  assert.equal(textExport.includes('#1 Budi Santoso — 27 Pts | 9W - 1L | 2 Season'), true);
  assert.equal(textExport.includes('SEASON 2 OKTOBER 2026: 15 Pts (5W-0L, Rank #1, Juara)'), true);

  const csvExport = generateLeagueCumulativeCsv(summaryOrgA);
  assert.equal(csvExport.includes('Rank,Organizer,Nama Pemain,Total Poin,Total Menang (W),Total Kalah (L),Jumlah Season,Rincian Per Season'), true);
  assert.equal(csvExport.includes('1,Toko Alpha,Budi Santoso,27,9,1,2'), true);
});
