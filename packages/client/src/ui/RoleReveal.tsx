import { REVEAL_DURATION_MS, type RolePayload } from "@house/shared";
import { useEffect, useState } from "react";

interface Props {
  payload: RolePayload;
  playerNames: Map<string, string>;
}

const COPY: Record<
  RolePayload["role"],
  { title: string; tagline: string; tone: string; objective: string }
> = {
  survivor: {
    title: "Survivor",
    tagline: "The house wants you. Don't let it have you.",
    tone: "#7bff5e",
    objective:
      "Complete tasks, seal the rituals, expose the Corrupted, and survive until dawn.",
  },
  corrupted: {
    title: "Corrupted",
    tagline: "The house has chosen you.",
    tone: "#ff5e5e",
    objective:
      "Sabotage the survivors. Protect the Vessel. Awaken the house from within.",
  },
  vessel: {
    title: "The Vessel",
    tagline: "Something old hides inside you.",
    tone: "#c45eff",
    objective:
      "Stay trusted. If you are named Second Witness when the house is at full haunt, the Corrupted win.",
  },
};

export function RoleReveal({ payload, playerNames }: Props) {
  const [remaining, setRemaining] = useState(
    Math.ceil(REVEAL_DURATION_MS / 1000),
  );
  const copy = COPY[payload.role];

  useEffect(() => {
    const start = Date.now();
    const id = window.setInterval(() => {
      const left = Math.max(
        0,
        Math.ceil((REVEAL_DURATION_MS - (Date.now() - start)) / 1000),
      );
      setRemaining(left);
    }, 250);
    return () => window.clearInterval(id);
  }, []);

  const teammates = payload.teammates
    .map((id) => playerNames.get(id) ?? id)
    .filter((n) => n.length > 0);

  return (
    <div className="reveal-backdrop">
      <div className="reveal-card" style={{ borderColor: copy.tone }}>
        <div className="reveal-eyebrow">The House Chooses</div>
        <h1 className="reveal-title" style={{ color: copy.tone }}>
          {copy.title}
        </h1>
        <p className="reveal-tagline">{copy.tagline}</p>
        <p className="reveal-objective">{copy.objective}</p>
        {teammates.length > 0 && (
          <div className="reveal-teammates">
            <div className="reveal-teammates-label">Known to you</div>
            <ul>
              {teammates.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="reveal-countdown">starting in {remaining}…</div>
      </div>
    </div>
  );
}
