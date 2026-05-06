export const ROOM_NAME = "mansion";

export const MIN_PLAYERS = 6;
export const MAX_PLAYERS = 12;
export const ROOM_CODE_LENGTH = 4;

export const REVEAL_DURATION_MS = 6000;

export const MEETING_DISCUSSION_MS = 30_000;
export const MEETING_VOTE_MS = 25_000;
export const BELL_INTERACT_RADIUS = 56;
export const SKIP_VOTE = "skip";

export const PANICKED_FEAR_THRESHOLD = 90;

export const PHASES = [
  "lobby",
  "reveal",
  "playing",
  "meeting",
  "voting",
  "ritual",
  "ended",
] as const;

export const ROLES = ["survivor", "corrupted", "vessel"] as const;

export const ROLE_DISTRIBUTION: Record<
  number,
  { survivors: number; corrupted: number; vessel: number }
> = {
  6: { survivors: 4, corrupted: 1, vessel: 1 },
  7: { survivors: 5, corrupted: 1, vessel: 1 },
  8: { survivors: 5, corrupted: 2, vessel: 1 },
  9: { survivors: 6, corrupted: 2, vessel: 1 },
  10: { survivors: 7, corrupted: 2, vessel: 1 },
  11: { survivors: 7, corrupted: 3, vessel: 1 },
  12: { survivors: 8, corrupted: 3, vessel: 1 },
};
