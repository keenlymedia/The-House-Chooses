import { Room, type Client } from "@colyseus/core";
import {
  C2S,
  S2C,
  MAX_PLAYERS,
  MIN_PLAYERS,
  type SetNamePayload,
} from "@house/shared";
import { MatchState, Player } from "../state/MatchState.js";
import { generateCode, registerCode, releaseCode } from "./roomCodes.js";

interface JoinOptions {
  name?: string;
  code?: string;
}

export class MansionRoom extends Room<MatchState> {
  maxClients = MAX_PLAYERS;
  private code = "";

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

    console.log(`[room ${this.roomId}] created with code ${this.code}`);
  }

  onJoin(client: Client, options: JoinOptions = {}): void {
    const player = new Player();
    player.id = client.sessionId;
    player.name = (options.name ?? "Guest").trim().slice(0, 16) || "Guest";
    player.isHost = this.state.players.size === 0;
    this.state.players.set(client.sessionId, player);

    console.log(
      `[room ${this.roomId}] +${player.name} (${client.sessionId}) host=${player.isHost}`,
    );
  }

  onLeave(client: Client): void {
    const leaving = this.state.players.get(client.sessionId);
    if (!leaving) return;
    const wasHost = leaving.isHost;
    this.state.players.delete(client.sessionId);

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
}
