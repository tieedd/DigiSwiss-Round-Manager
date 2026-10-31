import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePlayerStats,
  calculateOrganizerStats,
  calculateAdminStats
} from '../utils/statsLogic.ts';
import { compareVersions } from '../services/versionService.ts';

test('Tahap 9 TES STATS PLAYER: Menghitung total turnamen, match W-L, win rate, deck & warna stats, dan tren peringkat', () => {
  const dummyParticipations = [
    {
      id: 't1_p1',
      tournamentId: 't1',
      tournamentName: 'Digimon Store Championship',
      date: '2026-08-10',
      format: 'BO3',
      playerId: 'p1',
      uid: 'u1',
      organizerId: 'org1',
      name: 'Taichi',
      rank: 1,
      wins: 3,
      losses: 0,
      gamesWon: 6,
      gamesLost: 1,
      points: 9,
      omw: 66.7,
      gw: 85.7,
      ogw: 55.5,
      deckName: 'WarGreymon OTK',
      deckColors: ['Merah', 'Hitam'],
      createdAt: 1000
    },
    {
      id: 't2_p1',
      tournamentId: 't2',
      tournamentName: 'Tamers League R1',
      date: '2026-08-20',
      format: 'BO3',
      playerId: 'p1',
      uid: 'u1',
      organizerId: 'org1',
      name: 'Taichi',
      rank: 3,
      wins: 2,
      losses: 1,
      gamesWon: 4,
      gamesLost: 3,
      points: 6,
      omw: 55.5,
      gw: 57.1,
      ogw: 50.0,
      deckName: 'WarGreymon OTK',
      deckColors: ['Merah'],
      createdAt: 2000
    },
    {
      id: 't3_p1',
      tournamentId: 't3',
      tournamentName: 'Evolution Cup',
      date: '2026-09-01',
      format: 'BO1',
      playerId: 'p1',
      uid: 'u1',
      organizerId: 'org2',
      name: 'Taichi',
      rank: 5,
      wins: 1,
      losses: 2,
      gamesWon: 1,
      gamesLost: 2,
      points: 3,
      omw: 44.4,
      gw: 33.3,
      ogw: 48.0,
      deckName: 'MirageGaogamon',
      deckColors: ['Biru'],
      createdAt: 3000
    }
  ];

  const stats = calculatePlayerStats(dummyParticipations);

  assert.equal(stats.totalTournaments, 3);
  assert.equal(stats.totalWins, 6);
  assert.equal(stats.totalLosses, 3);
  assert.equal(stats.winRate, 66.7); // 6 / 9 = 66.7%
  assert.equal(stats.mostPlayedDeck, 'WarGreymon OTK');
  assert.equal(stats.mostPlayedColor, 'Merah');

  // Tren peringkat
  assert.equal(stats.rankTrend.length, 3);
  assert.equal(stats.rankTrend[0].rank, 1);
  assert.equal(stats.rankTrend[1].rank, 3);
  assert.equal(stats.rankTrend[2].rank, 5);

  // Performa deck
  const wargrey = stats.deckStats.find((d) => d.deckName === 'WarGreymon OTK');
  assert.ok(wargrey);
  assert.equal(wargrey.count, 2);
  assert.equal(wargrey.wins, 5);
  assert.equal(wargrey.losses, 1);
  assert.equal(wargrey.winRate, 83.3);

  // Empty state handling
  const emptyStats = calculatePlayerStats([]);
  assert.equal(emptyStats.totalTournaments, 0);
  assert.equal(emptyStats.winRate, 0);
  assert.equal(emptyStats.mostPlayedDeck, '-');
});

test('Tahap 9 TES STATS ORGANIZER: Menghitung rata-rata peserta, deck terpopuler, dan distribusi warna', () => {
  const dummyTournaments = [
    { id: 't1', name: 'Turnamen 1', status: 'finished' },
    { id: 't2', name: 'Turnamen 2', status: 'finished' }
  ];

  const dummyParticipations = [
    { id: '1', deckName: 'Red Hybrid', deckColors: ['Merah'], wins: 3, losses: 0 },
    { id: '2', deckName: 'Red Hybrid', deckColors: ['Merah'], wins: 2, losses: 1 },
    { id: '3', deckName: 'BloomHydra', deckColors: ['Hijau'], wins: 2, losses: 1 },
    { id: '4', deckName: 'MirageGaogamon', deckColors: ['Biru'], wins: 1, losses: 2 },
    { id: '5', deckName: 'Yellow Vaccine', deckColors: ['Kuning'], wins: 0, losses: 3 },
    { id: '6', deckName: 'Red Hybrid', deckColors: ['Merah'], wins: 3, losses: 0 }
  ];

  const orgStats = calculateOrganizerStats(dummyTournaments, dummyParticipations);

  assert.equal(orgStats.totalTournaments, 2);
  assert.equal(orgStats.totalParticipants, 6);
  assert.equal(orgStats.averagePlayers, 3);
  assert.equal(orgStats.mostPopularDeck, 'Red Hybrid');

  // Warna Merah paling banyak dipakai dan win rate tinggi
  const redDist = orgStats.colorDistribution.find((c) => c.color === 'Merah');
  assert.ok(redDist);
  assert.equal(redDist.count, 3);
  assert.equal(redDist.percentage, 50); // 3 dari 6 = 50%
});

test('Tahap 9 TES STATS ADMIN: Menghitung pengguna per peran, turnamen per status, dan meta global', () => {
  const dummyUsers = [
    { username: 'admindss', role: 'admin' },
    { username: 'org1', role: 'organizer' },
    { username: 'org2', role: 'organizer' },
    { username: 'p1', role: 'player' },
    { username: 'p2', role: 'player' },
    { username: 'p3', role: 'player' }
  ];

  const dummyTournaments = [
    { id: 't1', status: 'finished' },
    { id: 't2', status: 'running' },
    { id: 't3', status: 'registration' }
  ];

  const dummyParticipations = [
    { id: '1', deckName: 'Apocalymon', deckColors: ['Ungu'] },
    { id: '2', deckName: 'Apocalymon', deckColors: ['Ungu'] },
    { id: '3', deckName: 'Beelzemon', deckColors: ['Ungu'] }
  ];

  const adminStats = calculateAdminStats(dummyUsers, dummyTournaments, dummyParticipations);

  assert.equal(adminStats.totalUsers, 6);
  assert.equal(adminStats.usersByRole.admin, 1);
  assert.equal(adminStats.usersByRole.organizer, 2);
  assert.equal(adminStats.usersByRole.player, 3);

  assert.equal(adminStats.totalTournaments, 3);
  assert.equal(adminStats.tournamentsByStatus.finished, 1);
  assert.equal(adminStats.tournamentsByStatus.running, 1);
  assert.equal(adminStats.tournamentsByStatus.registration, 1);

  assert.equal(adminStats.topDecksGlobal[0].deckName, 'Apocalymon');
  assert.equal(adminStats.topDecksGlobal[0].count, 2);
});

test('Tahap 9 TES VERSI: compareVersions mengevaluasi semver secara benar', () => {
  assert.equal(compareVersions('1.1.0', '1.0.0'), 1);
  assert.equal(compareVersions('2.0.0', '1.9.9'), 1);
  assert.equal(compareVersions('1.0.1', '1.0.0'), 1);
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
  assert.equal(compareVersions('0.9.5', '1.0.0'), -1);
  assert.equal(compareVersions('1.0.0', '1.0.1'), -1);
});
