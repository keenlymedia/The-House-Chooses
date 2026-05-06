import { useEffect, useMemo, useRef, useState } from "react";
import type { Room } from "colyseus.js";
import type { RolePayload } from "@house/shared";
import { mountGame, type GameHandle } from "../game/mountGame.js";
import { useRoomState } from "./useRoomState.js";
import { RoleReveal } from "./RoleReveal.js";

interface Props {
  room: Room;
  role: RolePayload | null;
}

export function GameScreen({ room, role }: Props) {
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

  const playerNames = useMemo(() => {
    const m = new Map<string, string>();
    view?.players.forEach((p) => m.set(p.id, p.name));
    return m;
  }, [view]);

  const showReveal = role != null && view?.phase === "reveal";

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
        <div className="hud-row">
          <span className="hud-label">Phase</span>
          <span className="hud-value">{view?.phase ?? "—"}</span>
        </div>
        <div className="hud-hint">WASD to move</div>
      </div>

      {role && (
        <div className="role-badge" style={{ color: roleColor(role.role) }}>
          {role.role}
        </div>
      )}

      {showReveal && (
        <RoleReveal payload={role} playerNames={playerNames} />
      )}
    </div>
  );
}

function roleColor(role: RolePayload["role"]): string {
  if (role === "survivor") return "#7bff5e";
  if (role === "corrupted") return "#ff5e5e";
  return "#c45eff";
}
