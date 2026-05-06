// Client → server message types
export const C2S = {
  SetName: "setName",
  ToggleReady: "toggleReady",
  StartMatch: "startMatch",
  Move: "move",
} as const;

// Server → client message types
export const S2C = {
  Role: "role",
  Error: "error",
  Kicked: "kicked",
} as const;

export type C2SType = (typeof C2S)[keyof typeof C2S];
export type S2CType = (typeof S2C)[keyof typeof S2C];

export interface SetNamePayload {
  name: string;
}

export interface MovePayload {
  x: number;
  y: number;
}
