import type { PHASES, ROLES } from "./constants.js";

export type Phase = (typeof PHASES)[number];
export type Role = (typeof ROLES)[number];

export interface PublicPlayer {
  id: string;
  name: string;
  isHost: boolean;
  ready: boolean;
  alive: boolean;
  x: number;
  y: number;
}

export interface PrivateRoleInfo {
  role: Role;
  teammates: string[];
}

export interface LobbySummary {
  code: string;
  phase: Phase;
  playerCount: number;
  maxPlayers: number;
}
