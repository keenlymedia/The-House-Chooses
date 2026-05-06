import { ROLE_DISTRIBUTION, type Role } from "@house/shared";

export interface RoleAssignment {
  role: Role;
  // Other player ids visible to this player on the reveal screen.
  teammates: string[];
}

// Server-only assignment table. NEVER place this in @colyseus/schema state —
// the entire state is broadcast to every client. Keep roles in a private map
// keyed by sessionId and send them to each client via `client.send`.
export function assignRoles(
  playerIds: string[],
): Map<string, RoleAssignment> {
  const dist = ROLE_DISTRIBUTION[playerIds.length];
  if (!dist) {
    throw new Error(`unsupported player count for roles: ${playerIds.length}`);
  }

  const shuffled = [...playerIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  let cursor = 0;
  const survivors = shuffled.slice(cursor, (cursor += dist.survivors));
  const corrupted = shuffled.slice(cursor, (cursor += dist.corrupted));
  const vessel = shuffled.slice(cursor, (cursor += dist.vessel));

  const assignment = new Map<string, RoleAssignment>();
  for (const id of survivors) {
    assignment.set(id, { role: "survivor", teammates: [] });
  }
  // Corrupted know each other and know the Vessel.
  const corruptedKnow = [...corrupted, ...vessel];
  for (const id of corrupted) {
    assignment.set(id, {
      role: "corrupted",
      teammates: corruptedKnow.filter((x) => x !== id),
    });
  }
  // Vessel beginner mode: doesn't know the Corrupted.
  for (const id of vessel) {
    assignment.set(id, { role: "vessel", teammates: [] });
  }

  return assignment;
}

// Helper used by sabotage/kill systems. Vessel is corrupted-aligned but passive,
// so it does NOT count for active-sabotage gating.
export function canSabotage(role?: Role): boolean {
  return role === "corrupted";
}
