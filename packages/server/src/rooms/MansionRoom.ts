import { Room, type Client } from "@colyseus/core";
import {
  BELL_INTERACT_RADIUS,
  C2S,
  FEAR_FROM_BANISH_WITNESS,
  FEAR_FROM_CURSE,
  FEAR_FROM_FAILED_RITUAL,
  FEAR_FROM_WHISPER,
  FEAR_RELIEF_FROM_SEAL_RITUAL,
  FOYER_BELL,
  HAUNT_THRESHOLD_FULL,
  MAX_PLAYERS,
  MEETING_DISCUSSION_MS,
  MEETING_VOTE_MS,
  MIN_PLAYERS,
  PANICKED_FEAR_THRESHOLD,
  PLAYER_SPEED,
  REVEAL_DURATION_MS,
  RITUAL_AWAKENING_TARGET,
  RITUAL_DRAW_MS,
  RITUAL_INTERVAL_MS,
  RITUAL_SEAL_TARGET,
  RITUAL_VOTE_MS,
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
  type RitualCard,
  type RitualCardIndexPayload,
  type RitualHandPayload,
  type RitualNominatePayload,
  type RitualVotePayload,
  type RolePayload,
  type RoleRevealPayload,
  type SabotageFlashPayload,
  type SabotagePayload,
  type SabotageType,
  type SetNamePayload,
  type TaskIdPayload,
  type TileGrid,
  type VotePayload,
  type WhisperPayload,
  type WinReason,
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
import { LeaderQueue, RitualDeck, tallyRitualVote } from "../systems/ritual.js";
import { FearSystem } from "../systems/fear.js";

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

  // Ritual side-game state — server-only.
  private deck = new RitualDeck();
  private leaderQueue = new LeaderQueue();
  private leaderHand: RitualCard[] = [];
  private witnessHand: RitualCard[] = [];

  // Fear system. Update at 1Hz from the simulation loop.
  private fear = new FearSystem();
  private fearAccumMs = 0;

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
    this.onMessage(C2S.RitualNominate, (c, p: RitualNominatePayload) =>
      this.handleRitualNominate(c, p),
    );
    this.onMessage(C2S.RitualVote, (c, p: RitualVotePayload) =>
      this.handleRitualVote(c, p),
    );
    this.onMessage(C2S.RitualDiscard, (c, p: RitualCardIndexPayload) =>
      this.handleRitualDiscard(c, p),
    );
    this.onMessage(C2S.RitualResolve, (c, p: RitualCardIndexPayload) =>
      this.handleRitualResolve(c, p),
    );
    this.onMessage(C2S.RestartLobby, (c) => this.handleRestartLobby(c));

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
    this.leaderQueue.remove(client.sessionId);
    this.fear.forget(client.sessionId);

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
    this.leaderQueue.initialize(ids);

    for (const c of this.clients) {
      const assignment = this.roles.get(c.sessionId);
      if (assignment) this.sendRole(c, assignment);
    }

    this.spawnTasks();

    this.state.phase = "reveal";
    this.clock.setTimeout(() => {
      if (this.state.phase === "reveal") {
        this.state.phase = "playing";
        this.state.nextRitualAt = Date.now() + RITUAL_INTERVAL_MS;
      }
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
      this.concludeMatch("survivors", "seal_track");
      return;
    }
    this.checkAndMaybeConclude();
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
        const targetPlayer = this.state.players.get(result.whisper.sessionId);
        if (targetPlayer) {
          targetPlayer.fear = Math.min(
            100,
            targetPlayer.fear + FEAR_FROM_WHISPER,
          );
        }
      }
    }
    const flash: SabotageFlashPayload = { type };
    this.broadcast(S2C.SabotageFlash, flash);

    // A sabotage may have pushed haunt to max.
    this.checkAndMaybeConclude();
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
        this.leaderQueue.remove(outcome.banishedId);
        this.state.players.forEach((p) => {
          if (p.alive)
            p.fear = Math.min(100, p.fear + FEAR_FROM_BANISH_WITNESS);
        });
      }
    }

    const win = checkWin(this.state, this.roles);
    if (win.winner) {
      this.concludeMatch(win.winner, win.reason || "corrupted_outnumber");
      return;
    }

    this.clock.setTimeout(() => {
      if (this.state.phase !== "ended") this.state.phase = "playing";
    }, 4000);
    this.state.meeting.voteEndsAt = 0;
  }

  // --- ritual --------------------------------------------------------------

  private maybeStartRitual(): void {
    if (this.state.phase !== "playing") return;
    if (this.state.nextRitualAt === 0) return;
    if (Date.now() < this.state.nextRitualAt) return;
    this.startRitual();
  }

  private startRitual(): void {
    this.interactions.clear();
    for (const id of this.intents.keys()) {
      this.intents.set(id, { dx: 0, dy: 0 });
    }

    const leader = this.leaderQueue.next(this.state);
    if (!leader) {
      // No alive players — shouldn't happen mid-match, but bail safely.
      this.state.nextRitualAt = Date.now() + RITUAL_INTERVAL_MS;
      return;
    }

    const r = this.state.ritual;
    r.subPhase = "nominate";
    r.leaderId = leader;
    r.witnessId = "";
    r.votes.clear();
    r.voteEndsAt = 0;
    r.drawEndsAt = 0;
    r.publicOutcome = "";

    this.state.phase = "ritual";
    // No hard timer on nomination — leader picks at their pace. The vote
    // timer below applies once a witness is selected.
  }

  private handleRitualNominate(
    client: Client,
    payload: RitualNominatePayload,
  ): void {
    if (this.state.phase !== "ritual") return;
    const r = this.state.ritual;
    if (r.subPhase !== "nominate") return;
    if (client.sessionId !== r.leaderId) return;

    const witnessId = String(payload?.witnessId ?? "");
    if (witnessId === r.leaderId) return;
    const witness = this.state.players.get(witnessId);
    if (!witness?.alive || witness.banished) return;

    r.witnessId = witnessId;
    r.votes.clear();
    r.voteEndsAt = Date.now() + RITUAL_VOTE_MS;
    r.subPhase = "vote";

    this.clock.setTimeout(() => {
      if (
        this.state.phase === "ritual" &&
        this.state.ritual.subPhase === "vote" &&
        this.state.ritual.witnessId === witnessId
      ) {
        this.resolveRitualVote();
      }
    }, RITUAL_VOTE_MS);
  }

  private handleRitualVote(
    client: Client,
    payload: RitualVotePayload,
  ): void {
    if (this.state.phase !== "ritual") return;
    const r = this.state.ritual;
    if (r.subPhase !== "vote") return;
    const voter = this.state.players.get(client.sessionId);
    if (!voter?.alive || voter.banished) return;
    const v = payload?.vote;
    if (v !== "approve" && v !== "reject") return;
    if (r.votes.has(client.sessionId)) return;
    r.votes.set(client.sessionId, v);

    if (r.votes.size >= countAlive(this.state)) this.resolveRitualVote();
  }

  private resolveRitualVote(): void {
    const r = this.state.ritual;
    if (this.state.phase !== "ritual" || r.subPhase !== "vote") return;
    const outcome = tallyRitualVote(this.state);
    if (outcome === "reject") {
      r.failedVotes += 1;
      r.subPhase = "resolve";
      r.publicOutcome = "rejected";
      // Failure: bump fear for everyone alive, bump haunt slightly, rotate.
      this.state.players.forEach((p) => {
        if (p.alive && !p.banished) {
          p.fear = Math.min(100, p.fear + FEAR_FROM_FAILED_RITUAL);
        }
      });
      this.endRitualAfterFlash();
      return;
    }

    // Approval: instant Corrupted win if Vessel-as-witness at full haunt.
    const witnessRole = this.roles.get(r.witnessId)?.role;
    if (
      witnessRole === "vessel" &&
      this.state.hauntLevel >= HAUNT_THRESHOLD_FULL
    ) {
      r.subPhase = "resolve";
      r.publicOutcome = "vessel_witness";
      this.concludeMatch("corrupted", "vessel_witness");
      return;
    }

    // Draw 3 cards privately to the leader.
    this.leaderHand = this.deck.draw(3);
    r.subPhase = "leaderDraw";
    r.drawEndsAt = Date.now() + RITUAL_DRAW_MS;
    const leaderClient = this.clients.find(
      (c) => c.sessionId === r.leaderId,
    );
    if (leaderClient) {
      const payload: RitualHandPayload = { cards: [...this.leaderHand] };
      leaderClient.send(S2C.RitualLeaderHand, payload);
    }

    this.clock.setTimeout(() => {
      if (
        this.state.phase === "ritual" &&
        this.state.ritual.subPhase === "leaderDraw"
      ) {
        // Leader timed out: discard the first card to keep the game moving.
        this.applyLeaderDiscard(0);
      }
    }, RITUAL_DRAW_MS);
  }

  private handleRitualDiscard(
    client: Client,
    payload: RitualCardIndexPayload,
  ): void {
    if (this.state.phase !== "ritual") return;
    const r = this.state.ritual;
    if (r.subPhase !== "leaderDraw") return;
    if (client.sessionId !== r.leaderId) return;
    const idx = Number(payload?.cardIndex ?? -1);
    if (!Number.isInteger(idx) || idx < 0 || idx >= this.leaderHand.length) {
      return;
    }
    this.applyLeaderDiscard(idx);
  }

  private applyLeaderDiscard(idx: number): void {
    const r = this.state.ritual;
    if (r.subPhase !== "leaderDraw") return;
    if (idx < 0 || idx >= this.leaderHand.length) return;

    this.leaderHand.splice(idx, 1);
    this.witnessHand = [...this.leaderHand];
    this.leaderHand = [];

    r.subPhase = "witnessDraw";
    r.drawEndsAt = Date.now() + RITUAL_DRAW_MS;
    const witnessClient = this.clients.find(
      (c) => c.sessionId === r.witnessId,
    );
    if (witnessClient) {
      const payload: RitualHandPayload = { cards: [...this.witnessHand] };
      witnessClient.send(S2C.RitualWitnessHand, payload);
    }

    this.clock.setTimeout(() => {
      if (
        this.state.phase === "ritual" &&
        this.state.ritual.subPhase === "witnessDraw"
      ) {
        this.applyWitnessResolve(0);
      }
    }, RITUAL_DRAW_MS);
  }

  private handleRitualResolve(
    client: Client,
    payload: RitualCardIndexPayload,
  ): void {
    if (this.state.phase !== "ritual") return;
    const r = this.state.ritual;
    if (r.subPhase !== "witnessDraw") return;
    if (client.sessionId !== r.witnessId) return;
    const idx = Number(payload?.cardIndex ?? -1);
    if (!Number.isInteger(idx) || idx < 0 || idx >= this.witnessHand.length) {
      return;
    }
    this.applyWitnessResolve(idx);
  }

  private applyWitnessResolve(idx: number): void {
    const r = this.state.ritual;
    if (r.subPhase !== "witnessDraw") return;
    if (idx < 0 || idx >= this.witnessHand.length) return;

    const card = this.witnessHand[idx];
    this.witnessHand = [];
    r.subPhase = "resolve";
    r.publicOutcome = card;

    if (card === "seal") {
      r.sealCount += 1;
      // Group relief: completing a Seal cools everyone alive.
      this.state.players.forEach((p) => {
        if (p.alive && !p.banished) {
          p.fear = Math.max(0, p.fear - FEAR_RELIEF_FROM_SEAL_RITUAL);
        }
      });
    } else r.awakenCount += 1;

    if (r.sealCount >= RITUAL_SEAL_TARGET) {
      this.concludeMatch("survivors", "seal_track");
      return;
    }
    if (r.awakenCount >= RITUAL_AWAKENING_TARGET) {
      this.concludeMatch("corrupted", "awakening_track");
      return;
    }

    this.endRitualAfterFlash();
  }

  private endRitualAfterFlash(): void {
    this.clock.setTimeout(() => {
      if (this.state.phase !== "ritual") return;
      this.state.ritual.subPhase = "";
      this.state.ritual.witnessId = "";
      this.state.ritual.votes.clear();
      this.state.ritual.voteEndsAt = 0;
      this.state.ritual.drawEndsAt = 0;
      this.state.phase = "playing";
      this.state.nextRitualAt = Date.now() + RITUAL_INTERVAL_MS;
    }, 4000);
  }

  // --- match end + restart -------------------------------------------------

  private checkAndMaybeConclude(): void {
    if (this.state.phase === "ended") return;
    const win = checkWin(this.state, this.roles);
    if (!win.winner) return;
    this.concludeMatch(win.winner, win.reason || "corrupted_outnumber");
  }

  private concludeMatch(
    winner: "survivors" | "corrupted",
    reason: WinReason,
  ): void {
    if (this.state.phase === "ended") return;

    this.state.phase = "ended";
    this.state.winner = winner;
    this.state.winReason = reason;

    // Reveal every role to every client. Roles are still NOT in shared state;
    // this single broadcast contains them and clients render the lineup.
    const roleMap: Record<string, "survivor" | "corrupted" | "vessel"> = {};
    this.roles.forEach((assignment, id) => {
      roleMap[id] = assignment.role;
    });
    const payload: RoleRevealPayload = { roles: roleMap, winner, reason };
    this.broadcast(S2C.RoleReveal, payload);
  }

  private handleRestartLobby(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (!player?.isHost) {
      client.send(S2C.Error, { reason: "not_host" });
      return;
    }
    if (this.state.phase !== "ended") return;
    this.resetForRestart();
  }

  private resetForRestart(): void {
    // Clear server-only systems.
    this.roles.clear();
    this.interactions.clear();
    this.intents.clear();
    this.leaderQueue = new LeaderQueue();
    this.deck = new RitualDeck();
    this.fear = new FearSystem();
    this.leaderHand = [];
    this.witnessHand = [];
    this.fearAccumMs = 0;

    // Reset shared state.
    this.state.phase = "lobby";
    this.state.winner = "";
    this.state.winReason = "";
    this.state.hauntLevel = 0;
    this.state.sealProgress = 0;
    this.state.totalTasks = 0;
    this.state.doorLockExpiresAt = 0;
    this.state.lightsOutExpiresAt = 0;
    this.state.nextRitualAt = 0;
    this.state.tasks.clear();
    this.state.sabotageCooldowns.clear();

    const m = this.state.meeting;
    m.calledBy = "";
    m.discussionEndsAt = 0;
    m.voteEndsAt = 0;
    m.lastBanishedId = "";
    m.votes.clear();

    const r = this.state.ritual;
    r.subPhase = "";
    r.leaderId = "";
    r.witnessId = "";
    r.voteEndsAt = 0;
    r.drawEndsAt = 0;
    r.failedVotes = 0;
    r.sealCount = 0;
    r.awakenCount = 0;
    r.publicOutcome = "";
    r.votes.clear();

    // Reset players: alive, fear=0, ready=false, respawn at the foyer.
    const positions = spawnPositions();
    let i = 0;
    this.state.players.forEach((p) => {
      p.alive = true;
      p.banished = false;
      p.fear = 0;
      p.ready = false;
      const spawn = positions[i % positions.length];
      p.x = spawn.x;
      p.y = spawn.y;
      this.intents.set(p.id, { dx: 0, dy: 0 });
      i++;
    });
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
    this.maybeStartRitual();

    if (this.state.phase !== "playing" && this.state.phase !== "reveal") return;

    const now = Date.now();

    // Update fear at 1Hz so per-second deltas land cleanly.
    this.fearAccumMs += dt * 1000;
    if (this.fearAccumMs >= 1000 && this.state.phase === "playing") {
      this.fearAccumMs = 0;
      this.fear.update(this.state, now, 1);
    }

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
