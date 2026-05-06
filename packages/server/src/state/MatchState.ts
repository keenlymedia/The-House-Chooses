import { Schema, MapSchema, type } from "@colyseus/schema";
import type { Phase } from "@house/shared";

export class Player extends Schema {
  @type("string") id = "";
  @type("string") name = "";
  @type("string") color = "#9b6bff";
  @type("boolean") isHost = false;
  @type("boolean") ready = false;
  @type("boolean") alive = true;
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") fear = 0;
}

export class Task extends Schema {
  @type("string") id = "";
  @type("string") type = "";
  @type("string") roomId = "";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") durationMs = 3000;
  @type("boolean") complete = false;
  @type("boolean") cursed = false;
  @type("boolean") urgent = false;
}

export class MatchState extends Schema {
  @type("string") code = "";
  @type("string") phase: Phase = "lobby";
  @type("number") hauntLevel = 0; // 0..100
  @type("number") sealProgress = 0; // 0..100
  @type("number") totalTasks = 0;
  @type("number") doorLockExpiresAt = 0; // unix ms
  @type("number") lightsOutExpiresAt = 0; // unix ms
  // sabotage type → next-available unix ms
  @type({ map: "number" }) sabotageCooldowns = new MapSchema<number>();
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Task }) tasks = new MapSchema<Task>();
  @type("string") winner = "";
}
