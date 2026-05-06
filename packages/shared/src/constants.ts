export const ROOM_NAME = "mansion";

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 12;
export const ROOM_CODE_LENGTH = 4;

export const PHASES = [
  "lobby",
  "playing",
  "meeting",
  "voting",
  "ritual",
  "ended",
] as const;

export const ROLES = ["survivor", "corrupted", "vessel"] as const;
