import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import { C2S, SKIP_VOTE } from "@house/shared";
import type { RoomView } from "./useRoomState.js";

interface PlayerLite {
  id: string;
  name: string;
  color: string;
  alive: boolean;
  banished: boolean;
}

interface Props {
  room: Room;
  view: RoomView;
  selfAlive: boolean;
  voters: Set<string>;
  selfVote: string | null;
  players: PlayerLite[];
  meeting: {
    calledBy: string;
    discussionEndsAt: number;
    voteEndsAt: number;
    lastBanishedId: string;
  };
}

export function MeetingOverlay({
  room,
  view,
  selfAlive,
  voters,
  selfVote,
  players,
  meeting,
}: Props) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, []);

  const phase = view.phase;
  const calledByName =
    players.find((p) => p.id === meeting.calledBy)?.name ?? "Someone";
  const banished = meeting.lastBanishedId
    ? players.find((p) => p.id === meeting.lastBanishedId)
    : null;

  const remainingMs =
    phase === "meeting"
      ? Math.max(0, meeting.discussionEndsAt - now)
      : phase === "voting"
        ? Math.max(0, meeting.voteEndsAt - now)
        : 0;

  function vote(target: string) {
    if (!selfAlive) return;
    if (selfVote != null) return;
    room.send(C2S.Vote, { target });
  }

  return (
    <div className="meeting-backdrop">
      <div className="meeting-card">
        <div className="meeting-eyebrow">
          {phase === "meeting"
            ? "Emergency Meeting"
            : phase === "voting"
              ? "Voting"
              : "Meeting"}
        </div>
        <div className="meeting-header">
          {banished
            ? `${banished.name} was banished.`
            : phase === "meeting"
              ? `${calledByName} rang the bell.`
              : phase === "voting"
                ? "Cast your vote."
                : "No one was banished."}
        </div>
        {(phase === "meeting" || phase === "voting") && (
          <div className="meeting-timer">
            {Math.ceil(remainingMs / 1000)}s
          </div>
        )}
        <div className="meeting-grid">
          {players.map((p) => {
            const hasVoted = voters.has(p.id);
            const isMe = p.id === view.selfId;
            const eligible =
              phase === "voting" &&
              p.alive &&
              !p.banished &&
              p.id !== view.selfId;
            const selected = selfVote === p.id;
            return (
              <button
                key={p.id}
                className={`meeting-tile${
                  !p.alive || p.banished ? " out" : ""
                }${selected ? " selected" : ""}`}
                style={{ borderColor: selected ? p.color : undefined }}
                onClick={() => eligible && vote(p.id)}
                disabled={!eligible || selfVote != null}
              >
                <span
                  className="meeting-pip"
                  style={{ background: p.color }}
                />
                <span className="meeting-name">{p.name}</span>
                {isMe && <span className="meeting-tag">you</span>}
                {!p.alive && <span className="meeting-tag">out</span>}
                {hasVoted && <span className="meeting-tag voted">voted</span>}
              </button>
            );
          })}
        </div>
        {phase === "voting" && selfAlive && (
          <button
            className={`meeting-skip${selfVote === SKIP_VOTE ? " selected" : ""}`}
            onClick={() => vote(SKIP_VOTE)}
            disabled={selfVote != null}
          >
            Skip vote
          </button>
        )}
        {!selfAlive && (
          <div className="meeting-spectator">You are watching from beyond.</div>
        )}
      </div>
    </div>
  );
}
