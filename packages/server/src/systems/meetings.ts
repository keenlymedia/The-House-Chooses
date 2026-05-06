import { SKIP_VOTE } from "@house/shared";
import { MatchState } from "../state/MatchState.js";
import type { RoleAssignment } from "./roles.js";

export interface BanishOutcome {
  banishedId: string | null;
  votes: Map<string, number>;
  reason: "majority" | "tie" | "no_votes";
}

// Tally meeting votes. Plurality wins; ties (including all-skip) → no banish.
export function tallyMeeting(state: MatchState): BanishOutcome {
  const counts = new Map<string, number>();
  state.meeting.votes.forEach((target) => {
    counts.set(target, (counts.get(target) ?? 0) + 1);
  });
  if (counts.size === 0) {
    return { banishedId: null, votes: counts, reason: "no_votes" };
  }
  let topId = "";
  let topCount = 0;
  let tied = false;
  counts.forEach((c, id) => {
    if (c > topCount) {
      topId = id;
      topCount = c;
      tied = false;
    } else if (c === topCount) {
      tied = true;
    }
  });
  if (tied || topId === SKIP_VOTE) {
    return { banishedId: null, votes: counts, reason: "tie" };
  }
  return { banishedId: topId, votes: counts, reason: "majority" };
}

export interface WinCheckResult {
  winner: "" | "survivors" | "corrupted";
}

// After a banishment or kill, check whether the match should end.
// Survivors win iff every Corrupted AND the Vessel is dead/banished.
// Corrupted win iff alive corrupted-aligned >= alive survivors.
export function checkWin(
  state: MatchState,
  roles: Map<string, RoleAssignment>,
): WinCheckResult {
  let aliveSurvivors = 0;
  let aliveCorrupted = 0;
  let vesselAlive = false;
  state.players.forEach((p, id) => {
    if (!p.alive) return;
    const role = roles.get(id)?.role;
    if (role === "survivor") aliveSurvivors++;
    else if (role === "corrupted") aliveCorrupted++;
    else if (role === "vessel") vesselAlive = true;
  });

  if (aliveCorrupted === 0 && !vesselAlive) {
    return { winner: "survivors" };
  }
  if (aliveCorrupted + (vesselAlive ? 1 : 0) >= aliveSurvivors) {
    return { winner: "corrupted" };
  }
  return { winner: "" };
}
