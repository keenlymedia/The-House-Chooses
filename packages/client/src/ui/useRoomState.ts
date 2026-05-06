import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import type { SabotageType } from "@house/shared";

interface PlayerView {
  id: string;
  name: string;
  isHost: boolean;
  ready: boolean;
}

export interface RoomView {
  code: string;
  phase: string;
  hauntLevel: number;
  sealProgress: number;
  totalTasks: number;
  doorLockExpiresAt: number;
  lightsOutExpiresAt: number;
  sabotageCooldowns: Map<SabotageType, number>;
  winner: string;
  players: PlayerView[];
  selfId: string;
}

export function useRoomState(room: Room): RoomView | null {
  const [view, setView] = useState<RoomView | null>(null);

  useEffect(() => {
    function snapshot(): RoomView {
      const state = room.state as {
        code: string;
        phase: string;
        hauntLevel: number;
        sealProgress: number;
        totalTasks: number;
        doorLockExpiresAt: number;
        lightsOutExpiresAt: number;
        winner: string;
        players: { forEach: (cb: (p: PlayerView) => void) => void };
        sabotageCooldowns: { forEach: (cb: (v: number, k: string) => void) => void };
      };
      const players: PlayerView[] = [];
      state.players.forEach((p) => {
        players.push({
          id: p.id,
          name: p.name,
          isHost: p.isHost,
          ready: p.ready,
        });
      });
      const cooldowns = new Map<SabotageType, number>();
      state.sabotageCooldowns?.forEach((v, k) =>
        cooldowns.set(k as SabotageType, v),
      );
      return {
        code: state.code,
        phase: state.phase,
        hauntLevel: state.hauntLevel ?? 0,
        sealProgress: state.sealProgress ?? 0,
        totalTasks: state.totalTasks ?? 0,
        doorLockExpiresAt: state.doorLockExpiresAt ?? 0,
        lightsOutExpiresAt: state.lightsOutExpiresAt ?? 0,
        sabotageCooldowns: cooldowns,
        winner: state.winner ?? "",
        players,
        selfId: room.sessionId,
      };
    }

    setView(snapshot());
    const off = room.onStateChange(() => setView(snapshot()));
    return () => off();
  }, [room]);

  return view;
}
