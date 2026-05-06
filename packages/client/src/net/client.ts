import { Client, type Room } from "colyseus.js";
import { ROOM_NAME } from "@house/shared";

const SERVER_HTTP =
  import.meta.env.VITE_SERVER_HTTP ?? "http://localhost:2567";
const SERVER_WS = import.meta.env.VITE_SERVER_WS ?? "ws://localhost:2567";

export const colyseus = new Client(SERVER_WS);

export async function createRoom(name: string): Promise<Room> {
  return colyseus.create(ROOM_NAME, { name });
}

export async function joinByCode(code: string, name: string): Promise<Room> {
  const upper = code.toUpperCase();
  const res = await fetch(`${SERVER_HTTP}/code/${upper}`);
  if (!res.ok) throw new Error("room_not_found");
  const { roomId } = (await res.json()) as { roomId: string };
  return colyseus.joinById(roomId, { name });
}
