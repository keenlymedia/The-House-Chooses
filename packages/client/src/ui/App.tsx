import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import {
  S2C,
  type RolePayload,
  type RoleRevealPayload,
} from "@house/shared";
import { Landing } from "./Landing.js";
import { Lobby } from "./Lobby.js";
import { GameScreen } from "./GameScreen.js";

type View =
  | { kind: "landing" }
  | { kind: "lobby"; room: Room }
  | { kind: "game"; room: Room };

export function App() {
  const [view, setView] = useState<View>({ kind: "landing" });
  const [role, setRole] = useState<RolePayload | null>(null);
  const [reveal, setReveal] = useState<RoleRevealPayload | null>(null);

  useEffect(() => {
    if (view.kind === "landing") return;
    const offRole = view.room.onMessage(S2C.Role, (payload: RolePayload) => {
      setRole(payload);
    });
    const offReveal = view.room.onMessage(
      S2C.RoleReveal,
      (payload: RoleRevealPayload) => setReveal(payload),
    );
    return () => {
      offRole();
      offReveal();
    };
  }, [view]);

  // Watch for phase=lobby (a host-driven restart) and bounce the active
  // room back to the Lobby screen with cleared per-match state.
  useEffect(() => {
    if (view.kind !== "game") return;
    const off = view.room.onStateChange(() => {
      const phase = (view.room.state as { phase?: string }).phase;
      if (phase === "lobby") {
        setRole(null);
        setReveal(null);
        setView({ kind: "lobby", room: view.room });
      }
    });
    return () => off();
  }, [view]);

  if (view.kind === "landing") {
    return (
      <Landing
        onJoined={(room) => {
          setRole(null);
          setReveal(null);
          setView({ kind: "lobby", room });
        }}
      />
    );
  }
  if (view.kind === "lobby") {
    return (
      <Lobby
        room={view.room}
        onStart={() => setView({ kind: "game", room: view.room })}
        onLeave={() => {
          view.room.leave();
          setRole(null);
          setReveal(null);
          setView({ kind: "landing" });
        }}
      />
    );
  }
  return <GameScreen room={view.room} role={role} reveal={reveal} />;
}
