import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import type { SabotageType } from "@house/shared";

export interface PlayerView {
  id: string;
  name: string;
  color: string;
  isHost: boolean;
  ready: boolean;
  alive: boolean;
  banished: boolean;
  fear: number;
}

export interface MeetingView {
  calledBy: string;
  discussionEndsAt: number;
  voteEndsAt: number;
  lastBanishedId: string;
  voters: Set<string>;
  selfVote: string | null;
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
  meeting: MeetingView;
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
        meeting: {
          calledBy: string;
          discussionEndsAt: number;
          voteEndsAt: number;
          lastBanishedId: string;
          votes: { forEach: (cb: (v: string, k: string) => void) => void };
        };
      };
      const players: PlayerView[] = [];
      state.players.forEach((p) => {
        players.push({
          id: p.id,
          name: p.name,
          color: p.color,
          isHost: p.isHost,
          ready: p.ready,
          alive: p.alive,
          banished: p.banished,
          fear: p.fear,
        });
      });
      const cooldowns = new Map<SabotageType, number>();
      state.sabotageCooldowns?.forEach((v, k) =>
        cooldowns.set(k as SabotageType, v),
      );
      const voters = new Set<string>();
      let selfVote: string | null = null;
      state.meeting?.votes.forEach((target, voterId) => {
        voters.add(voterId);
        if (voterId === room.sessionId) selfVote = target;
      });
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
        meeting: {
          calledBy: state.meeting?.calledBy ?? "",
          discussionEndsAt: state.meeting?.discussionEndsAt ?? 0,
          voteEndsAt: state.meeting?.voteEndsAt ?? 0,
          lastBanishedId: state.meeting?.lastBanishedId ?? "",
          voters,
          selfVote,
        },
        selfId: room.sessionId,
      };
    }

    setView(snapshot());
    const off = room.onStateChange(() => setView(snapshot()));
    return () => off();
  }, [room]);

  return view;
}
