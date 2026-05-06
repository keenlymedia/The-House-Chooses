import { useEffect, useState } from "react";
import type { Room } from "colyseus.js";
import {
  C2S,
  SABOTAGE_HOTKEYS,
  SABOTAGE_LABELS,
  SABOTAGE_TYPES,
  type SabotageType,
} from "@house/shared";

interface Props {
  room: Room;
  cooldowns: Map<SabotageType, number>;
}

export function SabotagePanel({ room, cooldowns }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.repeat) return;
      const match = SABOTAGE_TYPES.find(
        (t) => SABOTAGE_HOTKEYS[t] === e.key,
      );
      if (!match) return;
      send(match);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  function send(type: SabotageType) {
    const ready = (cooldowns.get(type) ?? 0) <= Date.now();
    if (!ready) return;
    room.send(C2S.Sabotage, { type });
  }

  return (
    <div className="sabotage-panel">
      <div className="sabotage-eyebrow">Sabotage</div>
      <div className="sabotage-grid">
        {SABOTAGE_TYPES.map((type) => {
          const end = cooldowns.get(type) ?? 0;
          const remaining = Math.max(0, end - now);
          const ready = remaining === 0;
          return (
            <button
              key={type}
              className={`sabotage-btn${ready ? "" : " cooling"}`}
              onClick={() => send(type)}
              disabled={!ready}
            >
              <span className="sabotage-key">{SABOTAGE_HOTKEYS[type]}</span>
              <span className="sabotage-name">{SABOTAGE_LABELS[type]}</span>
              {!ready && (
                <span className="sabotage-cd">
                  {Math.ceil(remaining / 1000)}s
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
