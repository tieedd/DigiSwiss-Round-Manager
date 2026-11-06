export type UserRole = 'admin' | 'organizer' | 'player';

export interface UserProfile {
  username: string;
  displayName: string;
  role: UserRole;
  active: boolean;
  mustChangePassword?: boolean;
  createdAt: number;
  lastLoginAt?: number;
}

export type TournamentFormat = 'BO1' | 'BO3';
export type TournamentStatus = 'registration' | 'running' | 'finished';

export interface Tournament {
  id: string;
  name: string;
  date: string;
  location: string;
  format: TournamentFormat;
  status: TournamentStatus;
  organizerId: string;
  organizerName: string;
  totalRounds?: number;
  currentRound?: number;
  joinCode: string;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  finalized?: boolean;
  finalizedAt?: number;
}

export type PlayerStatus = 'waiting' | 'accepted' | 'rejected' | 'dropped';

export interface TournamentPlayer {
  id: string; // pid: uid untuk akun, acak untuk manual
  name: string;
  uid: string | null;
  manual: boolean;
  status: PlayerStatus;
  joinedAt: number;
}

export type RoundTimerStatus = 'idle' | 'running' | 'paused' | 'expired';

export interface RoundTimer {
  status: RoundTimerStatus;
  durationMs: number;
  startedAt?: any; // number ms atau Firestore Timestamp
  remainingMs: number;
}

export type RoundStatus = 'active' | 'completed';

export interface TournamentRound {
  number: number;
  status: RoundStatus;
  archived?: boolean;
  timer: RoundTimer;
}

export type MatchStatus = 'pending' | 'awaiting' | 'confirmed' | 'disputed';

export interface TournamentMatch {
  id: string;
  round: number;
  table: number;
  p1Id: string;
  p2Id: string | null; // null jika BYE
  p1Name: string;
  p2Name: string;
  p1Score: number;
  p2Score: number;
  status: MatchStatus;
  reportedBy?: string;
  archived?: boolean;
  updatedAt: number;
}

export type DeckColor =
  | 'Merah'
  | 'Biru'
  | 'Kuning'
  | 'Hijau'
  | 'Hitam'
  | 'Ungu'
  | 'Putih';

export interface Participation {
  id: string; // {tid}_{pid}
  tournamentId: string;
  tournamentName: string;
  date: string;
  format: TournamentFormat;
  playerId: string;
  uid: string | null;
  organizerId: string;
  name: string;
  rank: number;
  wins: number;
  losses: number;
  gamesWon: number;
  gamesLost: number;
  points: number;
  omw: number; // Opponent Match Win %
  gw: number;  // Game Win %
  ogw: number; // Opponent Game Win %
  deckName?: string;
  deckColors?: DeckColor[];
  isManual?: boolean;
  isDropped?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export interface AuditLog {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  target: string;
  tournamentId?: string;
  oldValue?: string | null;
  newValue?: string | null;
  createdAt: number;
}
