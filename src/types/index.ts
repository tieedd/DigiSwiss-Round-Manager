export type UserRole = 'admin' | 'organizer' | 'player';

export interface NotificationPrefs {
  enabled: boolean;
  announcements: boolean;
  rounds: boolean;
  scores: boolean;
  registration: boolean;
}

export type PushEventType =
  | 'announcement'
  | 'round_started'
  | 'score_pending'
  | 'score_disputed'
  | 'registration_status';

export interface NotifyPushInput {
  type: PushEventType;
  tournamentId: string;
  announcementId?: string;
  roundNumber?: number;
  matchId?: string;
  playerId?: string;
  playerIds?: string[];
}

export interface UserDeviceDoc {
  token: string;
  platform: 'android';
  updatedAt: number;
  appVersion?: string;
}

export interface UserProfile {
  username: string;
  displayName: string;
  role: UserRole;
  active: boolean;
  mustChangePassword?: boolean;
  notifPrefs?: NotificationPrefs;
  createdAt: number;
  lastLoginAt?: number;
}

export type TournamentFormat = 'BO1' | 'BO3';
export type TournamentType = 'regular' | 'league';
export type TournamentStatus = 'registration' | 'running' | 'finished';
export type MatchStage = 'swiss' | 'topcut';
export type TopCutSize = 4 | 8;
export type TopCutResultLabel = 'Juara' | 'Runner-up' | 'Semifinal' | 'Perempat Final';

export interface TournamentSeason {
  number: number;
  month: number; // 1-12
  year: number;
}

export interface TopCutSeed {
  playerId: string;
  name: string;
  swissRank: number;
}

export interface TournamentTopCut {
  size: TopCutSize;
  seeds: TopCutSeed[];
  startedAt: number;
}

export interface Tournament {
  id: string;
  name: string;
  date: string;
  location: string;
  format: TournamentFormat;
  type?: TournamentType;
  season?: TournamentSeason;
  status: TournamentStatus;
  organizerId: string;
  organizerName: string;
  totalRounds?: number;
  currentRound?: number;
  topCut?: TournamentTopCut;
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

export interface LeagueInvite {
  code: string;
  tournamentId: string;
  tournamentName: string;
  seasonLabel: string;
  organizerId: string;
  organizerName: string;
  active: boolean;
  inviteVersion?: number;
  createdAt: number;
  updatedAt?: number;
}

export interface LeagueInviteClaim {
  inviteCode: string;
  createdAt: number;
}

export interface LeagueDeckEntry {
  name: string;
  colors: DeckColor[];
}

export interface LeaguePlayerDecks {
  decks: [LeagueDeckEntry, LeagueDeckEntry];
  revealedTo: string[];
  updatedAt: number;
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
  stage?: MatchStage;
  archived?: boolean;
  timer: RoundTimer;
}

export type MatchStatus = 'pending' | 'awaiting' | 'confirmed' | 'disputed';
export type MatchGameWinner = 'p1' | 'p2';
export type LeagueDeckIndex = 0 | 1;

export interface MatchGameRecord {
  winner: MatchGameWinner;
  p1Deck: LeagueDeckIndex;
  p2Deck: LeagueDeckIndex;
}

export interface TournamentMatch {
  id: string;
  round: number;
  stage?: MatchStage;
  table: number;
  p1Id: string;
  p2Id: string | null; // null jika BYE
  p1Name: string;
  p2Name: string;
  p1Score: number;
  p2Score: number;
  p1Decks?: [LeagueDeckEntry, LeagueDeckEntry];
  p2Decks?: [LeagueDeckEntry, LeagueDeckEntry];
  games?: MatchGameRecord[];
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
  tournamentType?: TournamentType;
  season?: TournamentSeason;
  playerId: string;
  uid: string | null;
  organizerId: string;
  name: string;
  rank: number;
  swissRank?: number;
  topCutResult?: TopCutResultLabel;
  wins: number;
  losses: number;
  swissWins?: number;
  swissLosses?: number;
  swissPoints?: number;
  topCutWins?: number;
  topCutLosses?: number;
  topCutPoints?: number;
  gamesWon: number;
  gamesLost: number;
  points: number;
  omw: number; // Opponent Match Win %
  gw: number;  // Game Win %
  ogw: number; // Opponent Game Win %
  deckName?: string;
  deckColors?: DeckColor[];
  decks?: [LeagueDeckEntry, LeagueDeckEntry];
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

export interface TournamentAnnouncement {
  id: string;
  message: string;
  authorId: string;
  authorName: string;
  createdAt: number;
  updatedAt: number;
}
