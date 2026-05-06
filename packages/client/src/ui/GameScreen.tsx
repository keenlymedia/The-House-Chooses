import { useEffect, useMemo, useRef, useState } from "react";
import type { Room } from "colyseus.js";
import {
  TASK_LABELS,
  type RolePayload,
  type RoleRevealPayload,
  type TaskType,
} from "@house/shared";
import { mountGame, type GameHandle } from "../game/mountGame.js";
import { useRoomState } from "./useRoomState.js";
import { RoleReveal } from "./RoleReveal.js";
import { SabotagePanel } from "./SabotagePanel.js";
import { Whispers } from "./Whispers.js";
import { MeetingOverlay } from "./MeetingOverlay.js";
import { RitualOverlay } from "./RitualOverlay.js";
import { EndScreen } from "./EndScreen.js";
import { audio } from "../audio/cues.js";

interface Props {
  room: Room;
  role: RolePayload | null;
  reveal: RoleRevealPayload | null;
}

interface ActiveInteraction {
  taskType: TaskType;
  progress: number;
}

export function GameScreen({ room, role, reveal }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<GameHandle | null>(null);
  const [ping, setPing] = useState<number | null>(null);
  const [interaction, setInteraction] = useState<ActiveInteraction | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
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

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  // Phase-driven audio cues. Track previous phase to fire on transition.
  const prevPhaseRef = useRef<string | null>(null);
  useEffect(() => {
    audio.resume();
    const phase = view?.phase ?? null;
    const prev = prevPhaseRef.current;
    if (phase && phase !== prev) {
      if (phase === "meeting") audio.alarm();
      else if (phase === "ritual") audio.chime("up");
      else if (phase === "ended") audio.chime("down");
    }
    prevPhaseRef.current = phase;
  }, [view?.phase]);

  // Heartbeat at high fear. Period scales from ~1.4s at 60% fear to ~0.55s at 100%.
  useEffect(() => {
    const fear = view?.players.find((p) => p.id === view.selfId)?.fear ?? 0;
    if (fear < 60) return;
    const intensity = Math.min(0.6, 0.2 + (fear - 60) / 100);
    const period = Math.max(550, 1400 - (fear - 60) * 18);
    let alive = true;
    function beat() {
      if (!alive) return;
      audio.thump(intensity);
      window.setTimeout(beat, period);
    }
    const t = window.setTimeout(beat, period);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [view?.players, view?.selfId]);

  const playerNames = useMemo(() => {
    const m = new Map<string, string>();
    view?.players.forEach((p) => m.set(p.id, p.name));
    return m;
  }, [view]);

  const showReveal = role != null && view?.phase === "reveal";
  const showEnded = view?.phase === "ended" && reveal != null;
  const isCorrupted = role?.role === "corrupted";
  const inMeeting = view?.phase === "meeting" || view?.phase === "voting";
  const inRitual = view?.phase === "ritual";
  const self = view?.players.find((p) => p.id === view.selfId);
  const selfAlive = !!self?.alive && !self?.banished;
  const isHost = !!self?.isHost;
  const selfFear = self?.fear ?? 0;
  const fearTier = fearTierFor(selfFear);

  const lightsOutMs = (view?.lightsOutExpiresAt ?? 0) - now;
  const doorLockMs = (view?.doorLockExpiresAt ?? 0) - now;

  return (
    <div className={`game-shell fear-${fearTier}`}>
      <div ref={containerRef} className="game-canvas" />

      {/* Always-on haunted-mansion vignette around the local player.
          Camera follows the player so the screen-centered radial gradient
          tracks them naturally. */}
      <div className="mansion-lighting" />

      {lightsOutMs > 0 && <div className="lights-out-vignette" />}

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

      <div className="hud-meters">
        <div className="hud-meter">
          <div className="hud-meter-label">
            <span>Seal Progress</span>
            <span>{view?.sealProgress ?? 0}%</span>
          </div>
          <div className="hud-meter-bar">
            <div
              className="hud-meter-fill seal"
              style={{ width: `${view?.sealProgress ?? 0}%` }}
            />
          </div>
        </div>
        <div className="hud-meter">
          <div className="hud-meter-label">
            <span>Haunt</span>
            <span>{view?.hauntLevel ?? 0}%</span>
          </div>
          <div className="hud-meter-bar">
            <div
              className="hud-meter-fill haunt"
              style={{ width: `${view?.hauntLevel ?? 0}%` }}
            />
          </div>
        </div>
        <div className="hud-meter">
          <div className="hud-meter-label">
            <span>
              Fear {fearTier === "panic" && <em>· panicked</em>}
            </span>
            <span>{Math.round(selfFear)}%</span>
          </div>
          <div className="hud-meter-bar">
            <div
              className="hud-meter-fill fear"
              style={{ width: `${selfFear}%` }}
            />
          </div>
        </div>
      </div>

      {role && (
        <div className="role-badge" style={{ color: roleColor(role.role) }}>
          {role.role}
        </div>
      )}

      {(lightsOutMs > 0 || doorLockMs > 0) && (
        <div className="effects-strip">
          {lightsOutMs > 0 && (
            <div className="effect-chip lights">
              Lights out · {Math.ceil(lightsOutMs / 1000)}s
            </div>
          )}
          {doorLockMs > 0 && (
            <div className="effect-chip doors">
              Doors locked · {Math.ceil(doorLockMs / 1000)}s
            </div>
          )}
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

      <Whispers room={room} />

      {isCorrupted && view && !inMeeting && !inRitual && !showEnded && (
        <SabotagePanel room={room} cooldowns={view.sabotageCooldowns} />
      )}

      {inMeeting && view && (
        <MeetingOverlay
          room={room}
          view={view}
          selfAlive={selfAlive}
          voters={view.meeting.voters}
          selfVote={view.meeting.selfVote}
          players={view.players}
          meeting={view.meeting}
        />
      )}

      {inRitual && view && (
        <RitualOverlay
          room={room}
          view={view}
          ritual={view.ritual}
          players={view.players}
          selfId={view.selfId}
        />
      )}

      {showReveal && <RoleReveal payload={role} playerNames={playerNames} />}

      {showEnded && view && (
        <EndScreen
          room={room}
          reveal={reveal}
          players={view.players}
          isHost={isHost}
        />
      )}
    </div>
  );
}

function roleColor(role: RolePayload["role"]): string {
  if (role === "survivor") return "#7bff5e";
  if (role === "corrupted") return "#ff5e5e";
  return "#c45eff";
}

function fearTierFor(fear: number): "calm" | "uneasy" | "shaken" | "panic" {
  if (fear >= 90) return "panic";
  if (fear >= 70) return "shaken";
  if (fear >= 40) return "uneasy";
  return "calm";
}
