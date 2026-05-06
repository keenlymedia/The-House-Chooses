import { useState } from "react";
import type { Room } from "colyseus.js";
import { Landing } from "./Landing.js";
import { Lobby } from "./Lobby.js";
import { GameScreen } from "./GameScreen.js";

type View =
  | { kind: "landing" }
  | { kind: "lobby"; room: Room }
  | { kind: "game"; room: Room };

export function App() {
  const [view, setView] = useState<View>({ kind: "landing" });

  if (view.kind === "landing") {
    return <Landing onJoined={(room) => setView({ kind: "lobby", room })} />;
  }
  if (view.kind === "lobby") {
    return (
      <Lobby
        room={view.room}
        onStart={() => setView({ kind: "game", room: view.room })}
        onLeave={() => {
          view.room.leave();
          setView({ kind: "landing" });
        }}
      />
    );
  }
  return <GameScreen room={view.room} />;
}
