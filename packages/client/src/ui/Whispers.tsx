import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import { S2C, type WhisperPayload } from "@house/shared";

interface Whisper {
  id: number;
  text: string;
}

let seq = 0;

interface Props {
  room: Room;
}

export function Whispers({ room }: Props) {
  const [whispers, setWhispers] = useState<Whisper[]>([]);

  useEffect(() => {
    const off = room.onMessage(S2C.Whisper, (msg: WhisperPayload) => {
      const id = ++seq;
      setWhispers((w) => [...w, { id, text: msg.text }]);
      window.setTimeout(() => {
        setWhispers((w) => w.filter((x) => x.id !== id));
      }, 4500);
    });
    return () => off();
  }, [room]);

  if (whispers.length === 0) return null;

  return (
    <div className="whispers">
      {whispers.map((w) => (
        <div key={w.id} className="whisper">
          {w.text}
        </div>
      ))}
    </div>
  );
}
