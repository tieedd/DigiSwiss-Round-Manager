import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTournamentExportFileName,
  checkUniqueLeagueSeasonNumber,
  computeNextSeasonNumber,
  extractYearMonthFromDate,
  filterTournamentsByType,
  formatSeasonLabel,
  getIndonesianMonthUpper,
  getMinParticipantsToStart,
  getTournamentType,
  INDONESIAN_MONTHS_UPPER,
  isLeagueTournament,
  isRoundTimerEnabledForTournament,
  isTopCutMandatoryForTournament,
  validateSeasonInput,
} from '../utils/seasonLogic.ts';
import {
  buildDuplicateTournamentDraft,
  buildDuplicateTournamentPayload,
  computeTournamentChanges,
  formatAuditDiffSummary,
  getEditableFieldsForStatus,
  validateTournamentFormInput,
} from '../utils/tournamentEditLogic.ts';
import {
  generateStandingsCsv,
  generateStandingsText,
} from '../utils/deckExportLogic.ts';

test('LIGA 1: formatSeasonLabel menampilkan semua 12 bulan bahasa Indonesia huruf kapital', () => {
  const expectedMonths = [
    'JANUARI',
    'FEBRUARI',
    'MARET',
    'APRIL',
    'MEI',
    'JUNI',
    'JULI',
    'AGUSTUS',
    'SEPTEMBER',
    'OKTOBER',
    'NOVEMBER',
    'DESEMBER',
  ];
  assert.deepEqual([...INDONESIAN_MONTHS_UPPER], expectedMonths);

  expectedMonths.forEach((monthName, idx) => {
    const monthNum = idx + 1;
    assert.equal(getIndonesianMonthUpper(monthNum), monthName);
    assert.equal(
      formatSeasonLabel({ number: idx + 1, month: monthNum, year: 2026 }),
      `SEASON ${idx + 1} ${monthName} 2026`
    );
  });

  assert.equal(
    formatSeasonLabel({ number: 3, month: 11, year: 2026 }),
    'SEASON 3 NOVEMBER 2026'
  );
  assert.equal(formatSeasonLabel(null), null);
  assert.equal(formatSeasonLabel({ number: 0, month: 11, year: 2026 }), null);
  assert.equal(formatSeasonLabel({ number: 1, month: 13, year: 2026 }), null);
  assert.equal(formatSeasonLabel({ number: 1, month: 1, year: 1999 }), null);
});

test('LIGA 2: computeNextSeasonNumber per organizer (tanpa lihat nama liga) dan checkUniqueLeagueSeasonNumber', () => {
  const existing = [
    { id: 'reg_a', organizerId: 'orgA', name: 'Digimon Weekly Jakarta', type: 'regular' },
    { id: 'lg_a1', organizerId: 'orgA', name: 'Arcanum League', type: 'league', season: { number: 1, month: 9, year: 2026 } },
    { id: 'lg_a3', organizerId: 'orgA', name: 'Nama Liga Berbeda', type: 'league', season: { number: 3, month: 11, year: 2026 } },
    { id: 'lg_b5', organizerId: 'orgB', name: 'Bandung League', type: 'league', season: { number: 5, month: 10, year: 2026 } },
  ];

  // Belum ada liga milik organizer -> 1
  assert.equal(computeNextSeasonNumber([], 'orgA'), 1);
  assert.equal(computeNextSeasonNumber(existing, 'orgC'), 1);
  assert.equal(computeNextSeasonNumber(existing, ''), 1);

  // Nama liga berbeda pada organizer yang sama tetap dihitung, gap (1, 3) -> max + 1 = 4
  assert.equal(computeNextSeasonNumber(existing, 'orgA'), 4);
  assert.equal(computeNextSeasonNumber(existing, 'orgB'), 6);

  // Jika season tertinggi dihapus (tersisa 1 & 2) -> max + 1 = 3
  const afterDelete = [
    { id: 'lg_a1', organizerId: 'orgA', name: 'Liga A', type: 'league', season: { number: 1, month: 9, year: 2026 } },
    { id: 'lg_a2', organizerId: 'orgA', name: 'Liga B', type: 'league', season: { number: 2, month: 10, year: 2026 } },
  ];
  assert.equal(computeNextSeasonNumber(afterDelete, 'orgA'), 3);

  // Unik terhadap liga LAIN milik organizer yang sama
  const dupRes = checkUniqueLeagueSeasonNumber({
    seasonNumber: 3,
    organizerLeagues: existing,
    organizerId: 'orgA',
  });
  assert.equal(dupRes.unique, false);
  assert.equal(dupRes.error, 'Season 3 sudah dipakai di liga Nama Liga Berbeda milik Anda.');

  // Mengabaikan diri sendiri saat edit dan mengabaikan liga organizer lain
  assert.equal(
    checkUniqueLeagueSeasonNumber({
      seasonNumber: 3,
      organizerLeagues: existing,
      organizerId: 'orgA',
      excludeTournamentId: 'lg_a3',
    }).unique,
    true
  );
  assert.equal(
    checkUniqueLeagueSeasonNumber({
      seasonNumber: 5,
      organizerLeagues: existing,
      organizerId: 'orgA',
    }).unique,
    true
  );
});

test('LIGA 3: validateSeasonInput dan extractYearMonthFromDate', () => {
  assert.deepEqual(extractYearMonthFromDate('2026-11-25'), { month: 11, year: 2026 });
  assert.deepEqual(extractYearMonthFromDate('2027-01-05'), { month: 1, year: 2027 });

  const fallback = new Date(2026, 4, 10); // Mei 2026
  assert.deepEqual(extractYearMonthFromDate('invalid', fallback), { month: 5, year: 2026 });

  const validRes = validateSeasonInput({ number: 2, month: 12, year: 2026 });
  assert.equal(validRes.valid, true);
  assert.deepEqual(validRes.sanitized, { number: 2, month: 12, year: 2026 });

  assert.equal(validateSeasonInput(null).valid, false);
  assert.equal(validateSeasonInput({ number: 0, month: 5, year: 2026 }).valid, false);
  assert.equal(validateSeasonInput({ number: 1.5, month: 5, year: 2026 }).valid, false);
  assert.equal(validateSeasonInput({ number: 1, month: 0, year: 2026 }).valid, false);
  assert.equal(validateSeasonInput({ number: 1, month: 13, year: 2026 }).valid, false);
  assert.equal(validateSeasonInput({ number: 1, month: 5, year: 1995 }).valid, false);
  assert.equal(validateSeasonInput({ number: 1, month: 5, year: 2105 }).valid, false);
});

test('LIGA 4: aturan Liga vs Reguler dan kompatibilitas turnamen lama tanpa field type', () => {
  const legacyTournament = { id: 'old1', name: 'Turnamen Lama' };
  const regularTournament = { id: 'reg1', name: 'Store Cup', type: 'regular' };
  const leagueTournament = {
    id: 'lg1',
    name: 'Jakarta League',
    type: 'league',
    season: { number: 3, month: 11, year: 2026 },
  };

  // Turnamen lama tanpa field type tetap diperlakukan sebagai reguler
  assert.equal(getTournamentType(legacyTournament), 'regular');
  assert.equal(isLeagueTournament(legacyTournament), false);
  assert.equal(getMinParticipantsToStart(legacyTournament), 3);
  assert.equal(isRoundTimerEnabledForTournament(legacyTournament), true);
  assert.equal(isTopCutMandatoryForTournament(legacyTournament), false);

  // Turnamen reguler eksplisit
  assert.equal(getTournamentType(regularTournament), 'regular');
  assert.equal(getMinParticipantsToStart(regularTournament), 3);
  assert.equal(isRoundTimerEnabledForTournament(regularTournament), true);
  assert.equal(isTopCutMandatoryForTournament(regularTournament), false);

  // Turnamen Liga
  assert.equal(getTournamentType(leagueTournament), 'league');
  assert.equal(isLeagueTournament(leagueTournament), true);
  assert.equal(getMinParticipantsToStart(leagueTournament), 4);
  assert.equal(isRoundTimerEnabledForTournament(leagueTournament), false);
  assert.equal(isTopCutMandatoryForTournament(leagueTournament), true);

  // Filter daftar turnamen
  const mixed = [legacyTournament, regularTournament, leagueTournament];
  assert.equal(filterTournamentsByType(mixed, 'all').length, 3);
  assert.deepEqual(
    filterTournamentsByType(mixed, 'league').map((t) => t.id),
    ['lg1']
  );
  assert.deepEqual(
    filterTournamentsByType(mixed, 'regular').map((t) => t.id),
    ['old1', 'reg1']
  );
});

test('LIGA 5: nama berkas ekspor dan konten ekspor CSV/Teks menyertakan Season Liga', () => {
  const leagueTourney = {
    name: 'Jakarta Digimon League',
    type: 'league',
    season: { number: 3, month: 11, year: 2026 },
  };
  const regularTourney = {
    name: 'Weekly Cup',
  };

  assert.equal(
    buildTournamentExportFileName(leagueTourney, 'png'),
    'Hasil-Jakarta_Digimon_League-SEASON_3_NOVEMBER_2026.png'
  );
  assert.equal(
    buildTournamentExportFileName(leagueTourney, 'csv'),
    'Hasil-Jakarta_Digimon_League-SEASON_3_NOVEMBER_2026.csv'
  );
  assert.equal(
    buildTournamentExportFileName(leagueTourney, 'txt'),
    'Hasil-Jakarta_Digimon_League-SEASON_3_NOVEMBER_2026.txt'
  );
  assert.equal(buildTournamentExportFileName(regularTourney, 'png'), 'Hasil-Weekly_Cup.png');

  const leagueParts = [
    {
      id: 'lg1_p1',
      tournamentId: 'lg1',
      tournamentName: leagueTourney.name,
      date: '2026-11-20',
      format: 'BO3',
      tournamentType: 'league',
      season: leagueTourney.season,
      playerId: 'p1',
      uid: 'u1',
      organizerId: 'org1',
      name: 'Taichi',
      rank: 1,
      topCutResult: 'Juara',
      wins: 3,
      losses: 0,
      gamesWon: 6,
      gamesLost: 1,
      points: 9,
      omw: 66.7,
      gw: 85.7,
      ogw: 60.0,
      deckName: 'Greymon',
      deckColors: ['Merah'],
    },
  ];

  const csv = generateStandingsCsv(leagueTourney.name, leagueParts, {
    seasonLabel: 'SEASON 3 NOVEMBER 2026',
    isLeague: true,
  });
  assert.ok(csv.includes('"Jenis","Turnamen Liga"'));
  assert.ok(csv.includes('"Season","SEASON 3 NOVEMBER 2026"'));
  assert.ok(csv.includes('Peringkat,Nama Pemain,Tipe Peserta'));

  const text = generateStandingsText({
    tournamentName: leagueTourney.name,
    tournamentDate: '2026-11-20',
    format: 'BO3',
    participations: leagueParts,
    organizerName: 'Arcanum',
    location: 'Jakarta',
    seasonLabel: 'SEASON 3 NOVEMBER 2026',
    isLeague: true,
  });
  assert.ok(text.includes('Jenis: Turnamen Liga | SEASON 3 NOVEMBER 2026'));
  assert.ok(text.includes('HASIL AKHIR TURNAMEN: JAKARTA DIGIMON LEAGUE'));
});

test('LIGA 6: edit & duplikat Turnamen Liga (format terkunci BO3, nomor season terkunci di luar registration, duplikat Season + 1)', () => {
  const regLeaguePerms = getEditableFieldsForStatus('registration', 'league');
  assert.equal(regLeaguePerms.canEditFormat, false);
  assert.equal(regLeaguePerms.isFormatLocked, true);
  assert.equal(regLeaguePerms.canEditSeason, true);
  assert.equal(regLeaguePerms.canEditSeasonNumber, true);

  const runningLeaguePerms = getEditableFieldsForStatus('running', 'league');
  assert.equal(runningLeaguePerms.canEditFormat, false);
  assert.equal(runningLeaguePerms.canEditSeason, true);
  assert.equal(runningLeaguePerms.canEditSeasonNumber, false);

  // Validasi menolak Liga jika format bukan BO3 atau season tidak valid
  assert.equal(
    validateTournamentFormInput({
      name: 'Liga A',
      date: '2026-11-20',
      location: 'Jakarta',
      format: 'BO1',
      type: 'league',
      season: { number: 1, month: 11, year: 2026 },
    }).valid,
    false
  );

  // Edit Turnamen Liga saat registration: nomor season boleh berubah
  const regLeague = {
    id: 'lg_reg',
    name: 'Jakarta League',
    date: '2026-10-15',
    location: 'Jakarta',
    format: 'BO3',
    type: 'league',
    season: { number: 2, month: 10, year: 2026 },
    status: 'registration',
    finalized: false,
  };
  const regEditPlan = computeTournamentChanges(regLeague, {
    name: 'Jakarta League',
    date: '2026-11-15',
    location: 'Jakarta',
    format: 'BO3',
    type: 'league',
    season: { number: 4, month: 11, year: 2026 },
  });
  assert.equal(regEditPlan.valid, true);
  assert.deepEqual(regEditPlan.updates.season, { number: 4, month: 11, year: 2026 });

  // Edit Turnamen Liga finalized: nomor season terkunci di 2, bulan/tahun & nama tetap bisa berubah dan sinkron ke participations
  const currentLeague = {
    id: 'lg_1',
    name: 'Jakarta League',
    date: '2026-10-15',
    location: 'Jakarta',
    format: 'BO3',
    type: 'league',
    season: { number: 2, month: 10, year: 2026 },
    status: 'finished',
    finalized: true,
  };

  const editPlan = computeTournamentChanges(currentLeague, {
    name: 'Jakarta League Pro',
    date: '2026-11-15',
    location: 'Jakarta',
    format: 'BO1', // dicoba ubah ke BO1 -> harus tetap terkunci BO3
    type: 'league',
    season: { number: 3, month: 11, year: 2026 }, // dicoba ubah ke 3 saat finished -> nomor tetap terkunci 2
  });

  assert.equal(editPlan.valid, true);
  assert.equal(editPlan.hasChanges, true);
  assert.equal(editPlan.updates.format, undefined);
  assert.deepEqual(editPlan.updates.season, { number: 2, month: 11, year: 2026 });
  assert.equal(editPlan.needsParticipationSync, true);

  const diffSummary = formatAuditDiffSummary(editPlan.changes);
  assert.match(diffSummary.oldValue, /Season: SEASON 2 OKTOBER 2026/);
  assert.match(diffSummary.newValue, /Season: SEASON 2 NOVEMBER 2026/);

  // Duplikat Liga: season.number otomatis +1, bulan & tahun mengikuti tanggal hari ini
  const draft = buildDuplicateTournamentDraft(currentLeague, '2026-12-03');
  assert.deepEqual(draft, {
    name: 'Jakarta League',
    date: '2026-12-03',
    location: 'Jakarta',
    format: 'BO3',
    type: 'league',
    season: { number: 3, month: 12, year: 2026 },
  });

  const payload = buildDuplicateTournamentPayload(
    draft,
    { uid: 'org_1', name: 'Organizer' },
    { id: 'lg_2', previousJoinCode: 'OLD123', createdAt: 1733184000000 }
  );
  assert.equal(payload.type, 'league');
  assert.equal(payload.format, 'BO3');
  assert.deepEqual(payload.season, { number: 3, month: 12, year: 2026 });
  assert.equal(payload.status, 'registration');
  assert.notEqual(payload.joinCode, 'OLD123');
});
