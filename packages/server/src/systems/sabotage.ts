import {
  FEAR_FROM_CURSE,
  HAUNT_MAX,
  ROOMS,
  SABOTAGE_COOLDOWNS_MS,
  SABOTAGE_DURATIONS_MS,
  SABOTAGE_HAUNT_GAIN,
  TASK_DURATIONS_MS,
  TILE,
  WHISPER_TEXTS,
  type SabotageType,
  type TaskType,
  type TileGrid,
} from "@house/shared";
import { MatchState, Player, Task } from "../state/MatchState.js";

let fuseSeq = 0;

export interface SabotageContext {
  state: MatchState;
  grid: TileGrid;
  actorId: string;
  now: number;
}

export interface SabotageResult {
  ok: boolean;
  reason?:
    | "wrong_phase"
    | "not_corrupted"
    | "on_cooldown"
    | "no_target"
    | "actor_dead";
  // For falseWhisper: which session id receives the whisper, plus what text.
  whisper?: { sessionId: string; text: string };
}

export function applySabotage(
  type: SabotageType,
  ctx: SabotageContext,
  isCorrupted: boolean,
): SabotageResult {
  if (ctx.state.phase !== "playing") return { ok: false, reason: "wrong_phase" };
  if (!isCorrupted) return { ok: false, reason: "not_corrupted" };

  const actor = ctx.state.players.get(ctx.actorId);
  if (!actor?.alive) return { ok: false, reason: "actor_dead" };

  const cooldownEnd = ctx.state.sabotageCooldowns.get(type) ?? 0;
  if (ctx.now < cooldownEnd) return { ok: false, reason: "on_cooldown" };

  let result: SabotageResult = { ok: true };

  switch (type) {
    case "lightsOut": {
      ctx.state.lightsOutExpiresAt = ctx.now + SABOTAGE_DURATIONS_MS.lightsOut;
      break;
    }
    case "doorLock": {
      ctx.state.doorLockExpiresAt = ctx.now + SABOTAGE_DURATIONS_MS.doorLock;
      break;
    }
    case "falseWhisper": {
      const target = pickWhisperTarget(ctx.state, actor);
      if (!target) return { ok: false, reason: "no_target" };
      const text =
        WHISPER_TEXTS[Math.floor(Math.random() * WHISPER_TEXTS.length)];
      result = { ok: true, whisper: { sessionId: target.id, text } };
      break;
    }
    case "curseObject": {
      const target = pickCurseTarget(ctx.state, actor);
      if (!target) return { ok: false, reason: "no_target" };
      target.cursed = true;
      break;
    }
    case "breakFuseBox": {
      spawnFuseBoxTask(ctx.state, ctx.grid);
      break;
    }
  }

  ctx.state.sabotageCooldowns.set(type, ctx.now + SABOTAGE_COOLDOWNS_MS[type]);
  ctx.state.hauntLevel = Math.min(
    HAUNT_MAX,
    ctx.state.hauntLevel + SABOTAGE_HAUNT_GAIN,
  );

  return result;
}

function pickWhisperTarget(state: MatchState, actor: Player): Player | null {
  let best: { p: Player; d: number } | null = null;
  state.players.forEach((p) => {
    if (p.id === actor.id) return;
    if (!p.alive) return;
    const d = Math.hypot(p.x - actor.x, p.y - actor.y);
    if (!best || d < best.d) best = { p, d };
  });
  return best?.p ?? null;
}

function pickCurseTarget(state: MatchState, actor: Player): Task | null {
  let best: { t: Task; d: number } | null = null;
  state.tasks.forEach((t) => {
    if (t.complete || t.cursed) return;
    const d = Math.hypot(t.x - actor.x, t.y - actor.y);
    if (!best || d < best.d) best = { t, d };
  });
  return best?.t ?? null;
}

function spawnFuseBoxTask(state: MatchState, grid: TileGrid): void {
  for (let attempt = 0; attempt < 80; attempt++) {
    const room = ROOMS[Math.floor(Math.random() * ROOMS.length)];
    const tx = room.x + 1 + Math.floor(Math.random() * Math.max(1, room.w - 2));
    const ty = room.y + 1 + Math.floor(Math.random() * Math.max(1, room.h - 2));
    if (grid[ty]?.[tx] !== 0) continue;
    const wx = tx * TILE + TILE / 2;
    const wy = ty * TILE + TILE / 2;

    let tooClose = false;
    state.tasks.forEach((t) => {
      if (Math.hypot(t.x - wx, t.y - wy) < 60) tooClose = true;
    });
    if (tooClose) continue;

    fuseSeq++;
    const t = new Task();
    const type: TaskType = "repairFuseBox";
    t.id = `fuse-${fuseSeq}`;
    t.type = type;
    t.roomId = room.id;
    t.x = wx;
    t.y = wy;
    t.durationMs = TASK_DURATIONS_MS.repairFuseBox;
    t.urgent = true;
    state.tasks.set(t.id, t);
    state.totalTasks += 1;
    return;
  }
}

export function feartickFromCursedTask(player: Player): void {
  player.fear = Math.min(100, player.fear + FEAR_FROM_CURSE);
}
