import { Room, type Client } from "@colyseus/core";
import {
  C2S,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PLAYER_SPEED,
  S2C,
  buildTileGrid,
  canStand,
  spawnPositions,
  type MovePayload,
  type PingPayload,
  type SetNamePayload,
  type TileGrid,
} from "@house/shared";
import { MatchState, Player } from "../state/MatchState.js";
import { generateCode, registerCode, releaseCode } from "./roomCodes.js";

interface JoinOptions {
  name?: string;
}

const PLAYER_COLORS = [
  "#ff5e5e", "#5ec8ff", "#ffd25e", "#7bff5e", "#c45eff",
  "#ff5ec8", "#5effc8", "#ff8a3a", "#5e6dff", "#a8ff5e",
  "#ff5e9a", "#5effff",
];

const TICK_HZ = 20;

export class MansionRoom extends Room<MatchState> {
  maxClients = MAX_PLAYERS;
  private code = "";
  private grid: TileGrid = buildTileGrid();
  private intents = new Map<string, { dx: number; dy: number }>();

  onCreate(_options: unknown): void {
    this.code = generateCode();
    registerCode(this.code, this.roomId);

    const state = new MatchState();
    state.code = this.code;
    this.setState(state);

    this.onMessage(C2S.SetName, (client, payload: SetNamePayload) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      const trimmed = (payload?.name ?? "").trim().slice(0, 16);
      if (trimmed.length === 0) return;
      player.name = trimmed;
    });

    this.onMessage(C2S.ToggleReady, (client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      if (this.state.phase !== "lobby") return;
      player.ready = !player.ready;
    });

    this.onMessage(C2S.StartMatch, (client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player?.isHost) {
        client.send(S2C.Error, { reason: "not_host" });
        return;
      }
      if (this.state.phase !== "lobby") return;
      if (this.state.players.size < MIN_PLAYERS) {
        client.send(S2C.Error, { reason: "need_more_players" });
        return;
      }
      const allReady = Array.from(this.state.players.values()).every(
        (p) => p.ready || p.isHost,
      );
      if (!allReady) {
        client.send(S2C.Error, { reason: "not_all_ready" });
        return;
      }
      this.state.phase = "playing";
      // Role assignment + match systems land in step 4.
    });

    this.onMessage(C2S.Move, (client, payload: MovePayload) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !player.alive) return;
      const dx = clamp(Number(payload?.dx ?? 0), -1, 1);
      const dy = clamp(Number(payload?.dy ?? 0), -1, 1);
      this.intents.set(client.sessionId, { dx, dy });
    });

    this.onMessage(C2S.Ping, (client, payload: PingPayload) => {
      client.send(S2C.Pong, { t: payload?.t ?? 0 });
    });

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

  private tick(dt: number): void {
    for (const [id, player] of this.state.players) {
      const intent = this.intents.get(id);
      if (!intent || (intent.dx === 0 && intent.dy === 0)) continue;
      if (!player.alive) continue;

      // Normalize diagonal so speed is constant.
      const len = Math.hypot(intent.dx, intent.dy) || 1;
      const step = PLAYER_SPEED * dt;
      const stepX = (intent.dx / len) * step;
      const stepY = (intent.dy / len) * step;

      // Resolve axes independently for wall-sliding.
      const tryX = player.x + stepX;
      if (canStand(this.grid, tryX, player.y)) player.x = tryX;
      const tryY = player.y + stepY;
      if (canStand(this.grid, player.x, tryY)) player.y = tryY;
    }
  }

  private pickSpawn(): { x: number; y: number } {
    const positions = spawnPositions();
    const taken = Array.from(this.state.players.values()).map((p) => ({
      x: p.x,
      y: p.y,
    }));
    for (const pos of positions) {
      if (
        !taken.some(
          (t) => Math.hypot(t.x - pos.x, t.y - pos.y) < 16,
        )
      ) {
        return pos;
      }
    }
    return positions[0];
  }
}

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(lo, Math.min(hi, n));
}
