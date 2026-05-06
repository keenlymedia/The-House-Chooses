// Client → server message types
export const C2S = {
  SetName: "setName",
  ToggleReady: "toggleReady",
  StartMatch: "startMatch",
  Move: "move",
  Ping: "ping",
  TaskStart: "taskStart",
  TaskCancel: "taskCancel",
  TaskFinish: "taskFinish",
  Sabotage: "sabotage",
  CallMeeting: "callMeeting",
  Vote: "vote",
  RitualNominate: "ritualNominate",
  RitualVote: "ritualVote",
  RitualDiscard: "ritualDiscard",
  RitualResolve: "ritualResolve",
  RestartLobby: "restartLobby",
} as const;

// Server → client message types
export const S2C = {
  Role: "role",
  Error: "error",
  Kicked: "kicked",
  Pong: "pong",
  Whisper: "whisper",
  SabotageFlash: "sabotageFlash",
  RitualLeaderHand: "ritualLeaderHand",
  RitualWitnessHand: "ritualWitnessHand",
  RoleReveal: "roleReveal",
} as const;

export interface RolePayload {
  role: "survivor" | "corrupted" | "vessel";
  // Other player ids this player is allowed to know about (e.g. fellow Corrupted + Vessel).
  teammates: string[];
}

export type C2SType = (typeof C2S)[keyof typeof C2S];
export type S2CType = (typeof S2C)[keyof typeof S2C];

export interface SetNamePayload {
  name: string;
}

// Direction intent: each axis is -1, 0, or 1.
export interface MovePayload {
  dx: number;
  dy: number;
}

export interface PingPayload {
  t: number;
}

export interface PongPayload {
  t: number;
}

export interface TaskIdPayload {
  taskId: string;
}

export interface SabotagePayload {
  type:
    | "lightsOut"
    | "doorLock"
    | "falseWhisper"
    | "curseObject"
    | "breakFuseBox";
}

export interface WhisperPayload {
  text: string;
}

// Public broadcast: "something just happened" without revealing the actor.
export interface SabotageFlashPayload {
  type:
    | "lightsOut"
    | "doorLock"
    | "falseWhisper"
    | "curseObject"
    | "breakFuseBox";
}

export interface VotePayload {
  // Either a sessionId or "skip".
  target: string;
}

export type RitualCard = "seal" | "awakening";

export interface RitualNominatePayload {
  witnessId: string;
}

export interface RitualVotePayload {
  vote: "approve" | "reject";
}

export interface RitualCardIndexPayload {
  cardIndex: number;
}

export interface RitualHandPayload {
  cards: RitualCard[];
}

export type WinReason =
  | "seal_track"
  | "awakening_track"
  | "vessel_banished"
  | "vessel_witness"
  | "corrupted_outnumber"
  | "haunt_max"
  | "all_corrupted_eliminated";

// Sent once when phase becomes "ended". Contains every player's role so the
// final reveal screen can show the full lineup.
export interface RoleRevealPayload {
  roles: Record<string, "survivor" | "corrupted" | "vessel">;
  winner: "survivors" | "corrupted";
  reason: WinReason;
}
