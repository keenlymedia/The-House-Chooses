import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";

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
  winner: string;
  players: PlayerView[];
  selfId: string;
}

// Type-loose state snapshot. We tighten when we generate Colyseus schema types.
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
        winner: string;
        players: { forEach: (cb: (p: PlayerView) => void) => void };
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
      return {
        code: state.code,
        phase: state.phase,
        hauntLevel: state.hauntLevel ?? 0,
        sealProgress: state.sealProgress ?? 0,
        totalTasks: state.totalTasks ?? 0,
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
