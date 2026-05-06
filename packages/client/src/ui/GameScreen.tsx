import { useEffect, useRef, useState } from "react";
import type { Room } from "colyseus.js";
import { mountGame, type GameHandle } from "../game/mountGame.js";
import { useRoomState } from "./useRoomState.js";

interface Props {
  room: Room;
}

export function GameScreen({ room }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<GameHandle | null>(null);
  const [ping, setPing] = useState<number | null>(null);
  const view = useRoomState(room);

  useEffect(() => {
    if (!containerRef.current) return;
    handleRef.current = mountGame(containerRef.current, room, {
      setPing: (ms) => setPing(ms),
    });
    return () => {
      handleRef.current?.destroy();
      handleRef.current = null;
    };
  }, [room]);

  return (
    <div className="game-shell">
      <div ref={containerRef} className="game-canvas" />
      <div className="hud-debug">
        <div className="hud-row">
          <span className="hud-label">Room</span>
          <span className="hud-value mono">{view?.code ?? "…"}</span>
        </div>
        <div className="hud-row">
          <span className="hud-label">You</span>
          <span className="hud-value mono">{room.sessionId}</span>
        </div>
        <div className="hud-row">
          <span className="hud-label">Players</span>
          <span className="hud-value">{view?.players.length ?? 0}</span>
        </div>
        <div className="hud-row">
          <span className="hud-label">Ping</span>
          <span className="hud-value">
            {ping == null ? "—" : `${ping} ms`}
          </span>
        </div>
        <div className="hud-hint">WASD to move</div>
      </div>
    </div>
  );
}
