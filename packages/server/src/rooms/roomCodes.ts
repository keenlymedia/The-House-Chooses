import { ROOM_CODE_LENGTH } from "@house/shared";

// In-memory map of human-readable code → Colyseus roomId.
// Single-process for now; move to Redis when we scale to multiple nodes.
export const roomCodes = new Map<string, string>();

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I, O, 0, 1

export function generateCode(): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = "";
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
    if (!roomCodes.has(code)) return code;
  }
  throw new Error("could not generate unique room code");
}

export function registerCode(code: string, roomId: string): void {
  roomCodes.set(code, roomId);
}

export function releaseCode(code: string): void {
  roomCodes.delete(code);
}
