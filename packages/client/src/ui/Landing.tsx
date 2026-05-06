import { useState } from "react";
import type { Room } from "colyseus.js";
import { ROOM_CODE_LENGTH } from "@house/shared";
import { createRoom, joinByCode } from "../net/client.js";
import { MobileWarning } from "./MobileWarning.js";
import { audio } from "../audio/cues.js";

interface Props {
  onJoined: (room: Room) => void;
}

export function Landing({ onJoined }: Props) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    audio.resume();
    setError(null);
    setBusy(true);
    try {
      const room = await createRoom(name.trim() || "Host");
      onJoined(room);
    } catch (e) {
      setError(humanize(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin() {
    audio.resume();
    setError(null);
    if (code.length !== ROOM_CODE_LENGTH) {
      setError(`Code must be ${ROOM_CODE_LENGTH} letters.`);
      return;
    }
    setBusy(true);
    try {
      const room = await joinByCode(code, name.trim() || "Guest");
      onJoined(room);
    } catch (e) {
      setError(humanize(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell stack">
      <div>
        <h1>The House Chooses</h1>
        <p className="tagline">
          A haunted-mansion social deduction game for 6–12 players.
        </p>
      </div>

      <div>
        <label htmlFor="name">Your name</label>
        <input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 16))}
          placeholder="Guest"
          disabled={busy}
        />
      </div>

      <button onClick={handleCreate} disabled={busy}>
        Create new room
      </button>

      <div className="divider" />

      <div>
        <label htmlFor="code">Join with room code</label>
        <input
          id="code"
          className="code-input"
          value={code}
          onChange={(e) =>
            setCode(
              e.target.value
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, "")
                .slice(0, ROOM_CODE_LENGTH),
            )
          }
          placeholder="XXXX"
          maxLength={ROOM_CODE_LENGTH}
          disabled={busy}
        />
      </div>

      <button
        className="secondary"
        onClick={handleJoin}
        disabled={busy || code.length !== ROOM_CODE_LENGTH}
      >
        Join room
      </button>

      {error && <div className="error">{error}</div>}
      <MobileWarning />
    </div>
  );
}

function humanize(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("room_not_found")) return "No room found with that code.";
  return `Could not connect: ${msg}`;
}
