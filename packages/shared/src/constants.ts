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

// Ritual phase. Triggers periodically while phase=playing.
export const RITUAL_INTERVAL_MS = 90_000;
export const RITUAL_VOTE_MS = 25_000;
export const RITUAL_DRAW_MS = 30_000;
export const FAILED_RITUAL_VOTE_LIMIT = 3;

// Card deck composition.
export const RITUAL_DECK_SEAL = 11;
export const RITUAL_DECK_AWAKENING = 17;

// Win-track targets for the ritual side-game.
export const RITUAL_SEAL_TARGET = 4;
export const RITUAL_AWAKENING_TARGET = 5;

// If the Vessel is approved as Second Witness while haunt >= this, the
// Corrupted win instantly. 75 ≈ "haunt level 3" on the legacy 0..3 scale.
export const HAUNT_THRESHOLD_FULL = 75;

// Fear bumps wired to events outside fear.ts.
export const FEAR_FROM_FAILED_RITUAL = 15;
export const FEAR_FROM_BANISH_WITNESS = 20;
export const FEAR_FROM_WHISPER = 15;
export const FEAR_RELIEF_FROM_SEAL_RITUAL = 25;

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
