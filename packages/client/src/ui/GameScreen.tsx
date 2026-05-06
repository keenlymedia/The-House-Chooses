import { useEffect, useMemo, useRef, useState } from "react";
import type { Room } from "colyseus.js";
import { TASK_LABELS, type RolePayload, type TaskType } from "@house/shared";
import { mountGame, type GameHandle } from "../game/mountGame.js";
import { useRoomState } from "./useRoomState.js";
import { RoleReveal } from "./RoleReveal.js";

interface Props {
  room: Room;
  role: RolePayload | null;
}

interface ActiveInteraction {
  taskType: TaskType;
  progress: number;
}

export function GameScreen({ room, role }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<GameHandle | null>(null);
  const [ping, setPing] = useState<number | null>(null);
  const [interaction, setInteraction] = useState<ActiveInteraction | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);
  const view = useRoomState(room);

  useEffect(() => {
    if (!containerRef.current) return;
    handleRef.current = mountGame(
      containerRef.current,
      room,
      { setPing },
      { setActive: setInteraction, setPrompt },
    );
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
  const showEnded = view?.phase === "ended";

  return (
    <div className="game-shell">
      <div ref={containerRef} className="game-canvas" />

      <div className="hud-debug">
        <div className="hud-row">
          <span className="hud-label">Room</span>
          <span className="hud-value mono">{view?.code ?? "…"}</span>
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
        <div className="hud-hint">WASD — move • E — interact</div>
      </div>

      <div className="hud-seal">
        <div className="hud-seal-label">Seal Progress</div>
        <div className="hud-seal-bar">
          <div
            className="hud-seal-fill"
            style={{ width: `${view?.sealProgress ?? 0}%` }}
          />
        </div>
        <div className="hud-seal-value">{view?.sealProgress ?? 0}%</div>
      </div>

      {role && (
        <div className="role-badge" style={{ color: roleColor(role.role) }}>
          {role.role}
        </div>
      )}

      {prompt && !interaction && (
        <div className="interact-prompt">{prompt}</div>
      )}

      {interaction && (
        <div className="interact-bar">
          <div className="interact-bar-label">
            {TASK_LABELS[interaction.taskType]}
          </div>
          <div className="interact-bar-track">
            <div
              className="interact-bar-fill"
              style={{ width: `${interaction.progress * 100}%` }}
            />
          </div>
        </div>
      )}

      {showReveal && <RoleReveal payload={role} playerNames={playerNames} />}

      {showEnded && (
        <div className="end-banner">
          <div className="end-eyebrow">Match ended</div>
          <div className="end-title">
            {view?.winner === "survivors"
              ? "Survivors sealed the house"
              : view?.winner === "corrupted"
                ? "The house has chosen"
                : "Match ended"}
          </div>
        </div>
      )}
    </div>
  );
}

function roleColor(role: RolePayload["role"]): string {
  if (role === "survivor") return "#7bff5e";
  if (role === "corrupted") return "#ff5e5e";
  return "#c45eff";
}
