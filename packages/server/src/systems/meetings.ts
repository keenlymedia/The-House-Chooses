import { HAUNT_FULL, SKIP_VOTE, type WinReason } from "@house/shared";
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
  reason: WinReason | "";
}

// Centralized win-condition check, called after every event that can change
// the outcome (banish, kill, sabotage haunt bump, ritual resolution, task).
// Order matters: most decisive conditions first.
export function checkWin(
  state: MatchState,
  roles: Map<string, RoleAssignment>,
): WinCheckResult {
  // 1. Vessel banished → Survivors win immediately.
  let vesselAlive = false;
  let vesselBanished = false;
  state.players.forEach((p, id) => {
    if (roles.get(id)?.role !== "vessel") return;
    if (p.banished) vesselBanished = true;
    else if (p.alive) vesselAlive = true;
  });
  if (vesselBanished) return { winner: "survivors", reason: "vessel_banished" };

  // 2. Haunt at max → Corrupted win.
  if (state.hauntLevel >= HAUNT_FULL) {
    return { winner: "corrupted", reason: "haunt_max" };
  }

  // 3. Population check.
  let aliveSurvivors = 0;
  let aliveCorrupted = 0;
  state.players.forEach((p, id) => {
    if (!p.alive || p.banished) return;
    const role = roles.get(id)?.role;
    if (role === "survivor") aliveSurvivors++;
    else if (role === "corrupted") aliveCorrupted++;
  });

  // All Corrupted aligned eliminated → Survivors win.
  if (aliveCorrupted === 0 && !vesselAlive) {
    return { winner: "survivors", reason: "all_corrupted_eliminated" };
  }

  // Corrupted aligned >= Survivors → Corrupted win.
  const corruptedSide = aliveCorrupted + (vesselAlive ? 1 : 0);
  if (corruptedSide >= aliveSurvivors && aliveSurvivors > 0) {
    return { winner: "corrupted", reason: "corrupted_outnumber" };
  }

  return { winner: "", reason: "" };
}
