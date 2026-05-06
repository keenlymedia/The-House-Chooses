import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import { C2S, MIN_PLAYERS, S2C } from "@house/shared";
import { useRoomState } from "./useRoomState.js";

interface Props {
  room: Room;
  onStart: () => void;
  onLeave: () => void;
}

export function Lobby({ room, onStart, onLeave }: Props) {
  const view = useRoomState(room);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const off = room.onMessage(S2C.Error, (msg: { reason: string }) => {
      setError(humanizeError(msg.reason));
    });
    return () => off();
  }, [room]);

  useEffect(() => {
    if (view?.phase === "playing") onStart();
  }, [view?.phase, onStart]);

  if (!view) return <div className="shell">Connecting…</div>;

  const self = view.players.find((p) => p.id === view.selfId);
  const isHost = self?.isHost ?? false;
  const ready = self?.ready ?? false;
  const enoughPlayers = view.players.length >= MIN_PLAYERS;
  const allReady = view.players.every((p) => p.ready || p.isHost);

  function copyCode() {
    if (view) navigator.clipboard?.writeText(view.code).catch(() => {});
  }

  return (
    <div className="shell">
      <div className="lobby-header">
        <div>
          <div className="tagline" style={{ marginBottom: 4 }}>
            Room code
          </div>
          <div className="code-display">{view.code}</div>
        </div>
        <button className="secondary" onClick={copyCode}>
          Copy
        </button>
      </div>

      <div className="tagline" style={{ marginBottom: 8 }}>
        Players ({view.players.length}/12)
      </div>

      <ul className="player-list">
        {view.players.map((p) => (
          <li key={p.id}>
            <span>
              {p.name}
              {p.id === view.selfId ? " (you)" : ""}
            </span>
            <span style={{ display: "flex", gap: 6 }}>
              {p.isHost && <span className="badge host">Host</span>}
              {p.ready && !p.isHost && (
                <span className="badge ready">Ready</span>
              )}
            </span>
          </li>
        ))}
      </ul>

      <div className="row">
        {!isHost && (
          <button onClick={() => room.send(C2S.ToggleReady)}>
            {ready ? "Unready" : "Ready up"}
          </button>
        )}
        {isHost && (
          <button
            onClick={() => room.send(C2S.StartMatch)}
            disabled={!enoughPlayers || !allReady}
            title={
              !enoughPlayers
                ? `Need at least ${MIN_PLAYERS} players`
                : !allReady
                  ? "Waiting for everyone to ready up"
                  : ""
            }
          >
            Start match
          </button>
        )}
        <button className="secondary" onClick={onLeave}>
          Leave
        </button>
      </div>

      {error && <div className="error">{error}</div>}
    </div>
  );
}

function humanizeError(reason: string): string {
  switch (reason) {
    case "not_host":
      return "Only the host can start the match.";
    case "need_more_players":
      return `Need at least ${MIN_PLAYERS} players to start.`;
    case "not_all_ready":
      return "Everyone has to ready up first.";
    default:
      return reason;
  }
}
