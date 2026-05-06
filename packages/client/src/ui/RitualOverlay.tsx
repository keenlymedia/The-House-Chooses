import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import {
  C2S,
  RITUAL_AWAKENING_TARGET,
  RITUAL_SEAL_TARGET,
  S2C,
  type RitualCard,
  type RitualHandPayload,
} from "@house/shared";
import type { PlayerView, RitualView, RoomView } from "./useRoomState.js";

interface Props {
  room: Room;
  view: RoomView;
  ritual: RitualView;
  players: PlayerView[];
  selfId: string;
}

export function RitualOverlay({
  room,
  view,
  ritual,
  players,
  selfId,
}: Props) {
  const [now, setNow] = useState(Date.now());
  const [leaderHand, setLeaderHand] = useState<RitualCard[] | null>(null);
  const [witnessHand, setWitnessHand] = useState<RitualCard[] | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const offL = room.onMessage(S2C.RitualLeaderHand, (m: RitualHandPayload) =>
      setLeaderHand(m.cards),
    );
    const offW = room.onMessage(
      S2C.RitualWitnessHand,
      (m: RitualHandPayload) => setWitnessHand(m.cards),
    );
    return () => {
      offL();
      offW();
    };
  }, [room]);

  // Drop private hands when sub-phase changes away.
  useEffect(() => {
    if (ritual.subPhase !== "leaderDraw") setLeaderHand(null);
    if (ritual.subPhase !== "witnessDraw") setWitnessHand(null);
  }, [ritual.subPhase]);

  const isLeader = selfId === ritual.leaderId;
  const isWitness = selfId === ritual.witnessId;
  const self = players.find((p) => p.id === selfId);
  const isAlive = !!self?.alive && !self?.banished;
  const leaderName =
    players.find((p) => p.id === ritual.leaderId)?.name ?? "—";
  const witnessName =
    players.find((p) => p.id === ritual.witnessId)?.name ?? "—";

  const eligibleWitnesses = players.filter(
    (p) => p.alive && !p.banished && p.id !== ritual.leaderId,
  );

  const remaining = (() => {
    if (ritual.subPhase === "vote")
      return Math.max(0, ritual.voteEndsAt - now);
    if (ritual.subPhase === "leaderDraw" || ritual.subPhase === "witnessDraw")
      return Math.max(0, ritual.drawEndsAt - now);
    return 0;
  })();

  function nominate(witnessId: string) {
    room.send(C2S.RitualNominate, { witnessId });
  }
  function vote(v: "approve" | "reject") {
    room.send(C2S.RitualVote, { vote: v });
  }
  function discard(idx: number) {
    room.send(C2S.RitualDiscard, { cardIndex: idx });
  }
  function resolve(idx: number) {
    room.send(C2S.RitualResolve, { cardIndex: idx });
  }

  return (
    <div className="ritual-backdrop">
      <div className="ritual-card">
        <div className="ritual-tracks">
          <div className="ritual-track">
            <span>Seal</span>
            <span className="ritual-track-pips">
              {Array.from({ length: RITUAL_SEAL_TARGET }, (_, i) => (
                <span
                  key={i}
                  className={`pip seal${i < ritual.sealCount ? " on" : ""}`}
                />
              ))}
            </span>
          </div>
          <div className="ritual-track">
            <span>Awaken</span>
            <span className="ritual-track-pips">
              {Array.from({ length: RITUAL_AWAKENING_TARGET }, (_, i) => (
                <span
                  key={i}
                  className={`pip awaken${i < ritual.awakenCount ? " on" : ""}`}
                />
              ))}
            </span>
          </div>
        </div>

        <div className="ritual-eyebrow">Ritual</div>

        {ritual.subPhase === "nominate" && (
          <>
            <div className="ritual-header">
              {leaderName} is choosing a Second Witness
            </div>
            {isLeader ? (
              <div className="ritual-grid">
                {eligibleWitnesses.map((p) => (
                  <button
                    key={p.id}
                    className="ritual-tile"
                    onClick={() => nominate(p.id)}
                  >
                    <span
                      className="meeting-pip"
                      style={{ background: p.color }}
                    />
                    <span className="meeting-name">{p.name}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="ritual-wait">Waiting on the leader…</div>
            )}
          </>
        )}

        {ritual.subPhase === "vote" && (
          <>
            <div className="ritual-header">
              {leaderName} → {witnessName}
            </div>
            <div className="ritual-timer">
              {Math.ceil(remaining / 1000)}s · approve or reject
            </div>
            {isAlive ? (
              <div className="ritual-vote-row">
                <button
                  className={`ritual-vote approve${
                    ritual.selfVote === "approve" ? " selected" : ""
                  }`}
                  disabled={ritual.selfVote != null}
                  onClick={() => vote("approve")}
                >
                  Approve
                </button>
                <button
                  className={`ritual-vote reject${
                    ritual.selfVote === "reject" ? " selected" : ""
                  }`}
                  disabled={ritual.selfVote != null}
                  onClick={() => vote("reject")}
                >
                  Reject
                </button>
              </div>
            ) : (
              <div className="ritual-wait">You are watching from beyond.</div>
            )}
            <div className="ritual-voted">
              {ritual.voters.size} of {countAlive(players)} voted
            </div>
          </>
        )}

        {ritual.subPhase === "leaderDraw" && (
          <>
            <div className="ritual-header">
              {leaderName} draws three cards
            </div>
            {isLeader && leaderHand ? (
              <>
                <div className="ritual-timer">
                  {Math.ceil(remaining / 1000)}s · discard one
                </div>
                <div className="ritual-cards">
                  {leaderHand.map((card, i) => (
                    <button
                      key={i}
                      className={`ritual-card-tile ${card}`}
                      onClick={() => discard(i)}
                    >
                      {card === "seal" ? "Seal" : "Awaken"}
                      <span className="ritual-card-action">discard</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="ritual-wait">
                {isLeader ? "Drawing…" : "Waiting on the leader…"}
              </div>
            )}
          </>
        )}

        {ritual.subPhase === "witnessDraw" && (
          <>
            <div className="ritual-header">
              {witnessName} resolves the ritual
            </div>
            {isWitness && witnessHand ? (
              <>
                <div className="ritual-timer">
                  {Math.ceil(remaining / 1000)}s · choose one
                </div>
                <div className="ritual-cards">
                  {witnessHand.map((card, i) => (
                    <button
                      key={i}
                      className={`ritual-card-tile ${card}`}
                      onClick={() => resolve(i)}
                    >
                      {card === "seal" ? "Seal" : "Awaken"}
                      <span className="ritual-card-action">resolve</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="ritual-wait">
                {isWitness ? "Drawing…" : "Waiting on the witness…"}
              </div>
            )}
          </>
        )}

        {ritual.subPhase === "resolve" && (
          <div className={`ritual-resolution outcome-${ritual.publicOutcome}`}>
            {outcomeLabel(ritual.publicOutcome)}
          </div>
        )}
      </div>
    </div>
  );
}

function outcomeLabel(o: string): string {
  if (o === "seal") return "A Seal was placed.";
  if (o === "awakening") return "Something has woken.";
  if (o === "rejected") return "The witness was rejected.";
  if (o === "vessel_witness") return "The Vessel was named. The house wins.";
  return "—";
}

function countAlive(players: PlayerView[]): number {
  return players.filter((p) => p.alive && !p.banished).length;
}
