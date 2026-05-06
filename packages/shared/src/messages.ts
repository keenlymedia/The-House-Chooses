// Client → server message types
export const C2S = {
  SetName: "setName",
  ToggleReady: "toggleReady",
  StartMatch: "startMatch",
  Move: "move",
  Ping: "ping",
} as const;

// Server → client message types
export const S2C = {
  Role: "role",
  Error: "error",
  Kicked: "kicked",
  Pong: "pong",
} as const;

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
