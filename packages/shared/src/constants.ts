export const ROOM_NAME = "mansion";

// MVP: kept low so movement sync can be tested with two browsers.
// Step 4 (role assignment) will raise this to 4.
export const MIN_PLAYERS = 2;
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
