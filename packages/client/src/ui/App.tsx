import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import { S2C, type RolePayload } from "@house/shared";
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

  // Subscribe to the role message as soon as we have a room. The server sends
  // it once per match start, addressed only to this client.
  useEffect(() => {
    if (view.kind === "landing") return;
    const off = view.room.onMessage(S2C.Role, (payload: RolePayload) => {
      setRole(payload);
    });
    return () => off();
  }, [view]);

  if (view.kind === "landing") {
    return (
      <Landing
        onJoined={(room) => {
          setRole(null);
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
          setView({ kind: "landing" });
        }}
      />
    );
  }
  return <GameScreen room={view.room} role={role} />;
}
