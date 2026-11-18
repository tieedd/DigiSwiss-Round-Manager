import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDuplicateTournamentDraft,
  buildDuplicateTournamentPayload,
  chunkBatchItems,
  computeTournamentChanges,
  formatAuditDiffSummary,
  getEditableFieldsForStatus,
  getTodayDateString,
  validateTournamentFormInput,
} from '../utils/tournamentEditLogic.ts';

test('EDIT TURNAMEN: aturan field terkunci per status', () => {
  const regPerms = getEditableFieldsForStatus('registration');
  assert.equal(regPerms.canEditName, true);
  assert.equal(regPerms.canEditDate, true);
  assert.equal(regPerms.canEditLocation, true);
  assert.equal(regPerms.canEditFormat, true);
  assert.equal(regPerms.isFormatLocked, false);
  assert.equal(regPerms.formatLockReason, null);

  for (const status of ['running', 'finished']) {
    const perms = getEditableFieldsForStatus(status);
    assert.equal(perms.canEditName, true);
    assert.equal(perms.canEditDate, true);
    assert.equal(perms.canEditLocation, true);
    assert.equal(perms.canEditFormat, false);
    assert.equal(perms.isFormatLocked, true);
    assert.ok(perms.formatLockReason && perms.formatLockReason.length > 0);
  }
});

test('EDIT TURNAMEN: status running/finished mengunci format dan tidak mengubah field terlarang', () => {
  const runningTourney = {
    id: 't1',
    name: 'Digimon Weekly #10',
    date: '2026-11-10',
    location: 'Jakarta',
    format: 'BO3',
    status: 'running',
    organizerId: 'org1',
    organizerName: 'Organizer A',
    joinCode: 'ABC123',
    totalRounds: 4,
    createdAt: 1700000000000,
  };

  // Meskipun input mencoba mengganti format ke BO1, perubahan format harus terkunci/diabaikan
  const plan = computeTournamentChanges(runningTourney, {
    name: 'Digimon Weekly #10 Rev',
    date: '2026-11-12',
    location: 'Jakarta Selatan',
    format: 'BO1',
  });

  assert.equal(plan.valid, true);
  assert.equal(plan.hasChanges, true);
  assert.equal(plan.sanitizedValues.format, 'BO3');
  assert.equal(plan.updates.format, undefined);
  assert.deepEqual(Object.keys(plan.updates).sort(), ['date', 'location', 'name']);
  assert.equal('joinCode' in plan.updates, false);
  assert.equal('organizerId' in plan.updates, false);
  assert.equal('status' in plan.updates, false);
  assert.equal('totalRounds' in plan.updates, false);
  assert.equal(plan.changes.some((c) => c.field === 'format'), false);

  // Jika hanya format yang coba diubah saat finished, dianggap tidak ada perubahan
  const finishedOnlyFormat = computeTournamentChanges(
    { ...runningTourney, status: 'finished' },
    {
      name: 'Digimon Weekly #10',
      date: '2026-11-10',
      location: 'Jakarta',
      format: 'BO1',
    }
  );
  assert.equal(finishedOnlyFormat.valid, true);
  assert.equal(finishedOnlyFormat.hasChanges, false);
  assert.equal(finishedOnlyFormat.changes.length, 0);
});

test('EDIT TURNAMEN: deteksi perubahan saat registration, diff audit, validasi, dan sinkronisasi participations', () => {
  const regTourney = {
    name: 'Evolution Cup',
    date: '2026-11-15',
    location: 'Bandung',
    format: 'BO1',
    status: 'registration',
    finalized: false,
  };

  // Tanpa perubahan (hanya spasi)
  const noChange = computeTournamentChanges(regTourney, {
    name: '  Evolution Cup  ',
    date: '2026-11-15',
    location: 'Bandung ',
    format: 'BO1',
  });
  assert.equal(noChange.valid, true);
  assert.equal(noChange.hasChanges, false);
  assert.deepEqual(noChange.updates, {});
  assert.equal(noChange.needsParticipationSync, false);

  // Semua field berubah saat registration
  const fullChange = computeTournamentChanges(regTourney, {
    name: 'Evolution Cup Regional',
    date: '2026-11-20',
    location: 'Surabaya',
    format: 'BO3',
  });
  assert.equal(fullChange.valid, true);
  assert.equal(fullChange.hasChanges, true);
  assert.equal(fullChange.changes.length, 4);
  assert.equal(fullChange.updates.format, 'BO3');
  assert.equal(fullChange.needsParticipationSync, false);

  const auditDiff = formatAuditDiffSummary(fullChange.changes);
  assert.match(auditDiff.oldValue, /Nama Turnamen: Evolution Cup/);
  assert.match(auditDiff.newValue, /Nama Turnamen: Evolution Cup Regional/);
  assert.match(auditDiff.oldValue, /Format: BO1/);
  assert.match(auditDiff.newValue, /Format: BO3/);

  // Turnamen finalized: ubah nama/tanggal memicu sinkronisasi participations; ubah lokasi saja tidak
  const finalizedTourney = {
    ...regTourney,
    status: 'finished',
    finalized: true,
  };
  const locationOnly = computeTournamentChanges(finalizedTourney, {
    name: 'Evolution Cup',
    date: '2026-11-15',
    location: 'Yogyakarta',
    format: 'BO1',
  });
  assert.equal(locationOnly.hasChanges, true);
  assert.equal(locationOnly.needsParticipationSync, false);

  const nameChangedFinalized = computeTournamentChanges(finalizedTourney, {
    name: 'Evolution Cup Final',
    date: '2026-11-15',
    location: 'Bandung',
    format: 'BO1',
  });
  assert.equal(nameChangedFinalized.hasChanges, true);
  assert.equal(nameChangedFinalized.needsParticipationSync, true);

  // Validasi input kosong
  assert.equal(
    validateTournamentFormInput({ name: '   ', date: '2026-11-15', location: 'Bandung', format: 'BO3' }).valid,
    false
  );
  assert.equal(
    validateTournamentFormInput({ name: 'Cup', date: '', location: 'Bandung', format: 'BO3' }).valid,
    false
  );
  assert.equal(
    validateTournamentFormInput({ name: 'Cup', date: '2026-11-15', location: ' ', format: 'BO3' }).valid,
    false
  );
});

test('DUPLIKAT TURNAMEN: draft tanggal hari ini, joinCode baru, organizer pelaku, tanpa peserta/ronde/match', () => {
  const fixedToday = getTodayDateString(new Date('2026-11-18T10:00:00Z'));
  const source = {
    id: 'old_t1',
    name: 'Store Championship',
    date: '2026-10-01',
    location: 'Arcanum Store',
    format: 'BO3',
    status: 'finished',
    organizerId: 'old_org',
    organizerName: 'Old Organizer',
    joinCode: 'OLD999',
    totalRounds: 5,
    currentRound: 5,
    finalized: true,
    createdAt: 1700000000000,
  };

  const draft = buildDuplicateTournamentDraft(source, fixedToday);
  assert.deepEqual(draft, {
    name: 'Store Championship',
    date: '2026-11-18',
    location: 'Arcanum Store',
    format: 'BO3',
  });

  const duplicate = buildDuplicateTournamentPayload(
    { ...draft, name: 'Store Championship #2' },
    { uid: 'actor_admin_or_org', name: 'Pelaku Duplikat' },
    { id: 'new_t2', previousJoinCode: source.joinCode, createdAt: 1731924000000 }
  );

  assert.equal(duplicate.id, 'new_t2');
  assert.equal(duplicate.name, 'Store Championship #2');
  assert.equal(duplicate.date, '2026-11-18');
  assert.equal(duplicate.location, 'Arcanum Store');
  assert.equal(duplicate.format, 'BO3');
  assert.equal(duplicate.status, 'registration');
  assert.equal(duplicate.organizerId, 'actor_admin_or_org');
  assert.equal(duplicate.organizerName, 'Pelaku Duplikat');
  assert.notEqual(duplicate.joinCode, source.joinCode);
  assert.match(duplicate.joinCode, /^[A-Z0-9]{6}$/);
  assert.equal(duplicate.totalRounds, undefined);
  assert.equal(duplicate.currentRound, undefined);
  assert.equal(duplicate.finalized, undefined);
  assert.equal('players' in duplicate, false);
  assert.equal('rounds' in duplicate, false);
  assert.equal('matches' in duplicate, false);
  assert.equal('decks' in duplicate, false);
});

test('PEMECAHAN BATCH: chunkBatchItems memecah operasi maksimal 400 per batch', () => {
  assert.deepEqual(chunkBatchItems([], 400), []);

  const exact400 = Array.from({ length: 400 }, (_, i) => i);
  const chunks400 = chunkBatchItems(exact400, 400);
  assert.equal(chunks400.length, 1);
  assert.equal(chunks400[0].length, 400);

  const items850 = Array.from({ length: 850 }, (_, i) => `part_${i}`);
  const chunks850 = chunkBatchItems(items850, 400);
  assert.equal(chunks850.length, 3);
  assert.equal(chunks850[0].length, 400);
  assert.equal(chunks850[1].length, 400);
  assert.equal(chunks850[2].length, 50);
  assert.equal(chunks850[0][0], 'part_0');
  assert.equal(chunks850[2][49], 'part_849');
});
