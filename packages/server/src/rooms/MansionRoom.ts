import { Room, type Client } from "@colyseus/core";
import {
  BELL_INTERACT_RADIUS,
  C2S,
  FEAR_FROM_CURSE,
  FOYER_BELL,
  MAX_PLAYERS,
  MEETING_DISCUSSION_MS,
  MEETING_VOTE_MS,
  MIN_PLAYERS,
  PANICKED_FEAR_THRESHOLD,
  PLAYER_SPEED,
  REVEAL_DURATION_MS,
  ROLE_DISTRIBUTION,
  S2C,
  SABOTAGE_TYPES,
  SKIP_VOTE,
  TASK_DURATION_TOLERANCE_MS,
  TASK_INTERACT_RADIUS,
  buildTileGrid,
  canStand,
  doorTileKeys,
  spawnPositions,
  type MovePayload,
  type PingPayload,
  type RolePayload,
  type SabotageFlashPayload,
  type SabotagePayload,
  type SabotageType,
  type SetNamePayload,
  type TaskIdPayload,
  type TileGrid,
  type VotePayload,
  type WhisperPayload,
} from "@house/shared";
import { MatchState, Player } from "../state/MatchState.js";
import { generateCode, registerCode, releaseCode } from "./roomCodes.js";
import {
  assignRoles,
  canSabotage,
  type RoleAssignment,
} from "../systems/roles.js";
import { buildTaskSchema, spawnTasksForMatch } from "../systems/tasks.js";
import { applySabotage } from "../systems/sabotage.js";
import { checkWin, tallyMeeting } from "../systems/meetings.js";

interface JoinOptions {
  name?: string;
}

const PLAYER_COLORS = [
  "#ff5e5e", "#5ec8ff", "#ffd25e", "#7bff5e", "#c45eff",
  "#ff5ec8", "#5effc8", "#ff8a3a", "#5e6dff", "#a8ff5e",
  "#ff5e9a", "#5effff",
];

const TICK_HZ = 20;

interface Interaction {
  taskId: string;
  startedAt: number;
}

export class MansionRoom extends Room<MatchState> {
  maxClients = MAX_PLAYERS;
  private code = "";
  private grid: TileGrid = buildTileGrid();
  private doorTiles: Set<string> = doorTileKeys();
  private intents = new Map<string, { dx: number; dy: number }>();
  private roles = new Map<string, RoleAssignment>();
  private interactions = new Map<string, Interaction>();

  onCreate(_options: unknown): void {
    this.code = generateCode();
    registerCode(this.code, this.roomId);

    const state = new MatchState();
    state.code = this.code;
    this.setState(state);

    this.onMessage(C2S.SetName, (c, p: SetNamePayload) => this.handleSetName(c, p));
    this.onMessage(C2S.ToggleReady, (c) => this.handleToggleReady(c));
    this.onMessage(C2S.StartMatch, (c) => this.handleStartMatch(c));
    this.onMessage(C2S.Move, (c, p: MovePayload) => this.handleMove(c, p));
    this.onMessage(C2S.Ping, (c, p: PingPayload) => {
      c.send(S2C.Pong, { t: p?.t ?? 0 });
    });
    this.onMessage(C2S.TaskStart, (c, p: TaskIdPayload) => this.handleTaskStart(c, p));
    this.onMessage(C2S.TaskCancel, (c) => this.handleTaskCancel(c));
    this.onMessage(C2S.TaskFinish, (c, p: TaskIdPayload) => this.handleTaskFinish(c, p));
    this.onMessage(C2S.Sabotage, (c, p: SabotagePayload) => this.handleSabotage(c, p));
    this.onMessage(C2S.CallMeeting, (c) => this.handleCallMeeting(c));
    this.onMessage(C2S.Vote, (c, p: VotePayload) => this.handleVote(c, p));

    this.setSimulationInterval((dt) => this.tick(dt / 1000), 1000 / TICK_HZ);

    console.log(`[room ${this.roomId}] created with code ${this.code}`);
  }

  onJoin(client: Client, options: JoinOptions = {}): void {
    const player = new Player();
    player.id = client.sessionId;
    player.name = (options.name ?? "Guest").trim().slice(0, 16) || "Guest";
    player.isHost = this.state.players.size === 0;
    player.color = PLAYER_COLORS[this.state.players.size % PLAYER_COLORS.length];

    const spawn = this.pickSpawn();
    player.x = spawn.x;
    player.y = spawn.y;

    this.state.players.set(client.sessionId, player);
    this.intents.set(client.sessionId, { dx: 0, dy: 0 });

    const existing = this.roles.get(client.sessionId);
    if (existing) this.sendRole(client, existing);

    console.log(
      `[room ${this.roomId}] +${player.name} (${client.sessionId}) host=${player.isHost}`,
    );
  }

  onLeave(client: Client): void {
    const leaving = this.state.players.get(client.sessionId);
    if (!leaving) return;
    const wasHost = leaving.isHost;
    this.state.players.delete(client.sessionId);
    this.intents.delete(client.sessionId);
    this.roles.delete(client.sessionId);
    this.interactions.delete(client.sessionId);

    if (wasHost) {
      const next = this.state.players.values().next().value;
      if (next) next.isHost = true;
    }

    console.log(`[room ${this.roomId}] -${client.sessionId}`);
  }

  onDispose(): void {
    releaseCode(this.code);
    console.log(`[room ${this.roomId}] disposed (code ${this.code} freed)`);
  }

  // --- handlers ------------------------------------------------------------

  private handleSetName(client: Client, payload: SetNamePayload): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    const trimmed = (payload?.name ?? "").trim().slice(0, 16);
    if (!trimmed) return;
    player.name = trimmed;
  }

  private handleToggleReady(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    if (this.state.phase !== "lobby") return;
    player.ready = !player.ready;
  }

  private handleMove(client: Client, payload: MovePayload): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || !player.alive) return;
    if (this.state.phase !== "playing" && this.state.phase !== "reveal") return;
    const dx = clamp(Number(payload?.dx ?? 0), -1, 1);
    const dy = clamp(Number(payload?.dy ?? 0), -1, 1);
    this.intents.set(client.sessionId, { dx, dy });
  }

  private handleStartMatch(client: Client): void {
    const requester = this.state.players.get(client.sessionId);
    if (!requester?.isHost) {
      client.send(S2C.Error, { reason: "not_host" });
      return;
    }
    if (this.state.phase !== "lobby") return;
    if (this.state.players.size < MIN_PLAYERS) {
      client.send(S2C.Error, { reason: "need_more_players" });
      return;
    }
    if (!ROLE_DISTRIBUTION[this.state.players.size]) {
      client.send(S2C.Error, { reason: "unsupported_player_count" });
      return;
    }
    const allReady = Array.from(this.state.players.values()).every(
      (p) => p.ready || p.isHost,
    );
    if (!allReady) {
      client.send(S2C.Error, { reason: "not_all_ready" });
      return;
    }

    const ids = Array.from(this.state.players.keys());
    this.roles = assignRoles(ids);

    for (const c of this.clients) {
      const assignment = this.roles.get(c.sessionId);
      if (assignment) this.sendRole(c, assignment);
    }

    this.spawnTasks();

    this.state.phase = "reveal";
    this.clock.setTimeout(() => {
      if (this.state.phase === "reveal") this.state.phase = "playing";
    }, REVEAL_DURATION_MS);
  }

  private spawnTasks(): void {
    this.state.tasks.clear();
    const specs = spawnTasksForMatch(this.grid);
    for (const spec of specs) {
      this.state.tasks.set(spec.id, buildTaskSchema(spec));
    }
    this.state.totalTasks = specs.length;
    this.state.sealProgress = 0;
  }

  private handleTaskStart(client: Client, payload: TaskIdPayload): void {
    if (this.state.phase !== "playing") return;
    const player = this.state.players.get(client.sessionId);
    if (!player?.alive) return;
    const task = this.state.tasks.get(payload?.taskId ?? "");
    if (!task || task.complete) return;
    if (!withinReach(player, task)) return;
    this.interactions.set(client.sessionId, {
      taskId: task.id,
      startedAt: Date.now(),
    });
  }

  private handleTaskCancel(client: Client): void {
    this.interactions.delete(client.sessionId);
  }

  private handleTaskFinish(client: Client, payload: TaskIdPayload): void {
    if (this.state.phase !== "playing") return;
    const interaction = this.interactions.get(client.sessionId);
    if (!interaction) return;
    if (interaction.taskId !== payload?.taskId) return;

    const player = this.state.players.get(client.sessionId);
    const task = this.state.tasks.get(interaction.taskId);
    this.interactions.delete(client.sessionId);
    if (!player?.alive || !task || task.complete) return;
    if (!withinReach(player, task)) return;

    const elapsed = Date.now() - interaction.startedAt;
    if (elapsed < task.durationMs - TASK_DURATION_TOLERANCE_MS) return;

    const role = this.roles.get(client.sessionId)?.role;
    if (role !== "survivor") return;

    task.complete = true;
    if (task.cursed) {
      task.cursed = false;
      player.fear = Math.min(100, player.fear + FEAR_FROM_CURSE);
    }

    const completed = countCompleted(this.state);
    this.state.sealProgress = Math.round(
      (completed / Math.max(1, this.state.totalTasks)) * 100,
    );

    if (this.state.sealProgress >= 100) {
      this.state.phase = "ended";
      this.state.winner = "survivors";
    }
  }

  private handleSabotage(client: Client, payload: SabotagePayload): void {
    const type = payload?.type;
    if (!isSabotageType(type)) return;
    const role = this.roles.get(client.sessionId)?.role;
    const isCorr = canSabotage(role);
    const result = applySabotage(
      type,
      {
        state: this.state,
        grid: this.grid,
        actorId: client.sessionId,
        now: Date.now(),
      },
      isCorr,
    );
    if (!result.ok) {
      client.send(S2C.Error, { reason: `sabotage_${result.reason}` });
      return;
    }
    if (result.whisper) {
      const target = this.clients.find(
        (c) => c.sessionId === result.whisper!.sessionId,
      );
      if (target) {
        const w: WhisperPayload = { text: result.whisper.text };
        target.send(S2C.Whisper, w);
      }
    }
    const flash: SabotageFlashPayload = { type };
    this.broadcast(S2C.SabotageFlash, flash);
  }

  // --- meetings ------------------------------------------------------------

  private handleCallMeeting(client: Client): void {
    if (this.state.phase !== "playing") return;
    const player = this.state.players.get(client.sessionId);
    if (!player?.alive || player.banished) return;
    if (player.fear >= PANICKED_FEAR_THRESHOLD) {
      client.send(S2C.Error, { reason: "panicked" });
      return;
    }
    const d = Math.hypot(player.x - FOYER_BELL.x, player.y - FOYER_BELL.y);
    if (d > BELL_INTERACT_RADIUS) {
      client.send(S2C.Error, { reason: "not_at_bell" });
      return;
    }
    this.startMeeting(client.sessionId);
  }

  private startMeeting(calledBy: string): void {
    // Wipe interactions and movement intent — meetings freeze the world.
    this.interactions.clear();
    for (const id of this.intents.keys()) {
      this.intents.set(id, { dx: 0, dy: 0 });
    }

    const m = this.state.meeting;
    m.calledBy = calledBy;
    m.discussionEndsAt = Date.now() + MEETING_DISCUSSION_MS;
    m.voteEndsAt = 0;
    m.votes.clear();
    m.lastBanishedId = "";

    this.state.phase = "meeting";

    this.clock.setTimeout(() => {
      if (this.state.phase === "meeting") this.openVoting();
    }, MEETING_DISCUSSION_MS);
  }

  private openVoting(): void {
    this.state.phase = "voting";
    this.state.meeting.voteEndsAt = Date.now() + MEETING_VOTE_MS;
    this.clock.setTimeout(() => {
      if (this.state.phase === "voting") this.resolveVoting();
    }, MEETING_VOTE_MS);
  }

  private handleVote(client: Client, payload: VotePayload): void {
    if (this.state.phase !== "voting") return;
    const voter = this.state.players.get(client.sessionId);
    if (!voter?.alive || voter.banished) return;

    const target = String(payload?.target ?? "");
    if (target !== SKIP_VOTE) {
      const targetPlayer = this.state.players.get(target);
      if (!targetPlayer?.alive || targetPlayer.banished) return;
    }
    if (this.state.meeting.votes.has(client.sessionId)) return; // vote lock

    this.state.meeting.votes.set(client.sessionId, target);

    // If every alive player has voted, resolve early.
    const aliveCount = countAlive(this.state);
    if (this.state.meeting.votes.size >= aliveCount) {
      this.resolveVoting();
    }
  }

  private resolveVoting(): void {
    if (this.state.phase !== "voting") return;

    const outcome = tallyMeeting(this.state);
    if (outcome.banishedId && outcome.banishedId !== SKIP_VOTE) {
      const banished = this.state.players.get(outcome.banishedId);
      if (banished) {
        banished.alive = false;
        banished.banished = true;
        this.state.meeting.lastBanishedId = outcome.banishedId;
        // Witnessing a banish bumps fear for everyone alive.
        this.state.players.forEach((p) => {
          if (p.alive) p.fear = Math.min(100, p.fear + 8);
        });
      }
    }

    const win = checkWin(this.state, this.roles);
    if (win.winner) {
      this.state.phase = "ended";
      this.state.winner = win.winner;
      return;
    }

    // Resume play after a short pause so clients can show the outcome banner.
    this.clock.setTimeout(() => {
      if (this.state.phase !== "ended") this.state.phase = "playing";
    }, 4000);
    // Mark voting closed but keep meeting payload visible until phase swaps.
    this.state.meeting.voteEndsAt = 0;
  }

  // --- internals -----------------------------------------------------------

  private sendRole(client: Client, assignment: RoleAssignment): void {
    const payload: RolePayload = {
      role: assignment.role,
      teammates: assignment.teammates,
    };
    client.send(S2C.Role, payload);
  }

  private tick(dt: number): void {
    if (this.state.phase !== "playing" && this.state.phase !== "reveal") return;

    const now = Date.now();
    const lockedDoors =
      this.state.doorLockExpiresAt > now ? this.doorTiles : undefined;

    for (const [id, player] of this.state.players) {
      const intent = this.intents.get(id);
      if (!intent || (intent.dx === 0 && intent.dy === 0)) continue;
      if (!player.alive) continue;

      const len = Math.hypot(intent.dx, intent.dy) || 1;
      const step = PLAYER_SPEED * dt;
      const stepX = (intent.dx / len) * step;
      const stepY = (intent.dy / len) * step;

      const tryX = player.x + stepX;
      if (canStand(this.grid, tryX, player.y, undefined, lockedDoors)) {
        player.x = tryX;
      }
      const tryY = player.y + stepY;
      if (canStand(this.grid, player.x, tryY, undefined, lockedDoors)) {
        player.y = tryY;
      }

      const inter = this.interactions.get(id);
      if (inter) {
        const task = this.state.tasks.get(inter.taskId);
        if (!task || !withinReach(player, task)) {
          this.interactions.delete(id);
        }
      }
    }
  }

  private pickSpawn(): { x: number; y: number } {
    const positions = spawnPositions();
    const taken = Array.from(this.state.players.values()).map((p) => ({
      x: p.x,
      y: p.y,
    }));
    for (const pos of positions) {
      if (!taken.some((t) => Math.hypot(t.x - pos.x, t.y - pos.y) < 16)) {
        return pos;
      }
    }
    return positions[0];
  }
}

function isSabotageType(t: unknown): t is SabotageType {
  return (
    typeof t === "string" &&
    (SABOTAGE_TYPES as readonly string[]).includes(t)
  );
}

function withinReach(
  player: { x: number; y: number },
  task: { x: number; y: number },
): boolean {
  return Math.hypot(player.x - task.x, player.y - task.y) <= TASK_INTERACT_RADIUS;
}

function countCompleted(state: MatchState): number {
  let n = 0;
  state.tasks.forEach((t) => {
    if (t.complete) n++;
  });
  return n;
}

function countAlive(state: MatchState): number {
  let n = 0;
  state.players.forEach((p) => {
    if (p.alive && !p.banished) n++;
  });
  return n;
}

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(lo, Math.min(hi, n));
}
