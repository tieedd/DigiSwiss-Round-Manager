import { Tournament } from '../types';

let sessionTournament: Tournament | null = null;

export function getSessionTournament(): Tournament | null {
  return sessionTournament;
}

export function setSessionTournament(t: Tournament | null): void {
  sessionTournament = t;
}
