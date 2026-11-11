import type { Participation, TournamentPlayer } from '../types/index.ts';

export interface HistoryPlayerCandidate {
  id: string; // key identifikasi: 'uid:<uid>' atau 'name:<normalizedName>'
  name: string;
  uid: string | null;
  isManual: boolean;
  tournamentsCount: number;
  lastTournamentDate: string;
  lastTournamentTimestamp: number;
  isAlreadyRegistered?: boolean;
}

/**
 * Menggabungkan seluruh partisipasi dari turnamen-turnamen milik organizer menjadi
 * daftar kandidat pemain unik.
 * Aturan:
 * - Pemain berakun digabungkan berdasarkan uid.
 * - Pemain manual yang belum ditautkan digabungkan berdasarkan nama (tanpa membedakan huruf besar/kecil).
 * - Menghitung jumlah turnamen unik yang pernah diikuti dan tanggal turnamen terakhir.
 */
export function aggregateHistoryPlayers(
  participations: Participation[]
): HistoryPlayerCandidate[] {
  if (!participations || participations.length === 0) return [];

  const map = new Map<
    string,
    {
      candidate: HistoryPlayerCandidate;
      tournamentIdSet: Set<string>;
    }
  >();

  participations.forEach((p) => {
    const rawName = (p.name || '').trim();
    if (!rawName) return;

    const hasUid = Boolean(p.uid && p.uid.trim());
    const key = hasUid
      ? `uid:${p.uid!.trim()}`
      : `name:${rawName.toLowerCase()}`;

    const dateStr = p.date || '';
    const timestamp = p.createdAt || 0;

    const existing = map.get(key);
    if (!existing) {
      const tourneySet = new Set<string>();
      if (p.tournamentId) tourneySet.add(p.tournamentId);

      map.set(key, {
        candidate: {
          id: key,
          name: rawName,
          uid: hasUid ? p.uid!.trim() : null,
          isManual: !hasUid,
          tournamentsCount: 1,
          lastTournamentDate: dateStr,
          lastTournamentTimestamp: timestamp
        },
        tournamentIdSet: tourneySet
      });
    } else {
      if (p.tournamentId) {
        existing.tournamentIdSet.add(p.tournamentId);
        existing.candidate.tournamentsCount = existing.tournamentIdSet.size;
      }

      // Perbarui tanggal turnamen terakhir jika entri ini lebih baru
      if (timestamp >= existing.candidate.lastTournamentTimestamp) {
        existing.candidate.lastTournamentTimestamp = timestamp;
        if (dateStr) {
          existing.candidate.lastTournamentDate = dateStr;
        }
        // Gunakan nama tampilan terbaru
        existing.candidate.name = rawName;
      }
    }
  });

  // Urutkan berdasarkan tanggal turnamen terakhir (terbaru dulu), lalu abjad nama
  return Array.from(map.values())
    .map((item) => item.candidate)
    .sort((a, b) => {
      if (b.lastTournamentTimestamp !== a.lastTournamentTimestamp) {
        return b.lastTournamentTimestamp - a.lastTournamentTimestamp;
      }
      return a.name.localeCompare(b.name, 'id');
    });
}

/**
 * Menandai kandidat yang sudah ada di turnamen tujuan saat ini.
 * Pemain yang sudah ada (diterima, waiting list, atau manual dengan nama sama)
 * ditandai isAlreadyRegistered = true.
 */
export function markAlreadyRegisteredPlayers(
  candidates: HistoryPlayerCandidate[],
  currentPlayers: TournamentPlayer[]
): HistoryPlayerCandidate[] {
  if (!candidates || candidates.length === 0) return [];
  if (!currentPlayers || currentPlayers.length === 0) {
    return candidates.map((c) => ({ ...c, isAlreadyRegistered: false }));
  }

  const registeredUids = new Set<string>();
  const registeredNames = new Set<string>();

  currentPlayers.forEach((p) => {
    if (p.uid && p.uid.trim()) {
      registeredUids.add(p.uid.trim());
    }
    if (p.name && p.name.trim()) {
      registeredNames.add(p.name.trim().toLowerCase());
    }
  });

  return candidates.map((c) => {
    const cleanName = c.name.trim().toLowerCase();
    const isRegistered =
      (c.uid ? registeredUids.has(c.uid) : false) ||
      registeredNames.has(cleanName);

    return {
      ...c,
      isAlreadyRegistered: isRegistered
    };
  });
}

/**
 * Filter kandidat berdasarkan pencarian nama
 */
export function filterCandidatesByName(
  candidates: HistoryPlayerCandidate[],
  searchQuery: string
): HistoryPlayerCandidate[] {
  if (!searchQuery || !searchQuery.trim()) return candidates;
  const filter = searchQuery.trim().toLowerCase();
  return candidates.filter((c) => c.name.toLowerCase().includes(filter));
}

export interface PlayerToAddPayload {
  id: string;
  name: string;
  uid: string | null;
  manual: boolean;
  status: 'accepted';
  joinedAt: number;
}

/**
 * Menyiapkan payload dokumen pemain yang akan ditambahkan ke turnamen.
 * - Pemain berakun ditambahkan dengan id = uid aslinya, manual = false, status = 'accepted'.
 * - Pemain manual ditambahkan dengan id berawalan m_, manual = true, uid = null, status = 'accepted'.
 */
export function preparePlayersToAdd(
  selectedCandidates: HistoryPlayerCandidate[],
  baseTime: number = Date.now()
): PlayerToAddPayload[] {
  return selectedCandidates.map((c, idx) => {
    if (c.uid) {
      return {
        id: c.uid,
        name: c.name.trim(),
        uid: c.uid,
        manual: false,
        status: 'accepted',
        joinedAt: baseTime + idx
      };
    } else {
      const pid =
        'm_' +
        (baseTime + idx).toString(36) +
        Math.random().toString(36).substring(2, 6);
      return {
        id: pid,
        name: c.name.trim(),
        uid: null,
        manual: true,
        status: 'accepted',
        joinedAt: baseTime + idx
      };
    }
  });
}
