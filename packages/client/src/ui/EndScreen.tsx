import {
  C2S,
  type RoleRevealPayload,
  type WinReason,
} from "@house/shared";
import type { Room } from "colyseus.js";
import type { PlayerView } from "./useRoomState.js";

interface Props {
  room: Room;
  reveal: RoleRevealPayload;
  players: PlayerView[];
  isHost: boolean;
}

const REASON_TEXT: Record<WinReason, string> = {
  seal_track: "The Seal Track was completed.",
  awakening_track: "The Awakening Track was completed.",
  vessel_banished: "The Vessel was banished.",
  vessel_witness: "The Vessel was named Second Witness.",
  corrupted_outnumber: "The Corrupted outnumber the Survivors.",
  haunt_max: "The house has fully woken.",
  all_corrupted_eliminated: "Every Corrupted has been eliminated.",
};

export function EndScreen({ room, reveal, players, isHost }: Props) {
  const survivorsWon = reveal.winner === "survivors";
  return (
    <div className="end-shell">
      <div
        className={`end-card ${survivorsWon ? "survivors" : "corrupted"}`}
      >
        <div className="end-eyebrow">Match ended</div>
        <h1 className="end-title">
          {survivorsWon
            ? "Survivors sealed the house"
            : "The house has chosen"}
        </h1>
        <p className="end-reason">{REASON_TEXT[reveal.reason]}</p>

        <div className="end-lineup-label">Final lineup</div>
        <ul className="end-lineup">
          {players.map((p) => {
            const role = reveal.roles[p.id];
            return (
              <li key={p.id} className={`end-row role-${role}`}>
                <span
                  className="end-pip"
                  style={{ background: p.color }}
                />
                <span className="end-name">{p.name}</span>
                {p.banished && <span className="end-tag">banished</span>}
                {!p.alive && !p.banished && (
                  <span className="end-tag">dead</span>
                )}
                <span className={`end-role role-${role}`}>{role}</span>
              </li>
            );
          })}
        </ul>

        {isHost ? (
          <button
            className="end-restart"
            onClick={() => room.send(C2S.RestartLobby, {})}
          >
            Return to lobby
          </button>
        ) : (
          <div className="end-wait">Waiting for the host to restart…</div>
        )}
      </div>
    </div>
  );
}
