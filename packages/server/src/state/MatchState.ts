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
  @type("boolean") banished = false;
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

export class Meeting extends Schema {
  @type("string") calledBy = "";
  @type("number") discussionEndsAt = 0;
  @type("number") voteEndsAt = 0;
  // Maps voterId → "skip" or a sessionId. Server only writes; client cannot
  // forge entries because every Vote message is validated by sessionId.
  @type({ map: "string" }) votes = new MapSchema<string>();
  @type("string") lastBanishedId = "";
}

export class Ritual extends Schema {
  // "" | "nominate" | "vote" | "leaderDraw" | "witnessDraw" | "resolve"
  @type("string") subPhase = "";
  @type("string") leaderId = "";
  @type("string") witnessId = "";
  // voterId → "approve" | "reject"
  @type({ map: "string" }) votes = new MapSchema<string>();
  @type("number") voteEndsAt = 0;
  @type("number") drawEndsAt = 0;
  @type("number") failedVotes = 0;
  @type("number") sealCount = 0;
  @type("number") awakenCount = 0;
  // Last resolved card type, broadcast publicly. "seal" | "awakening" | ""
  @type("string") publicOutcome = "";
}

export class MatchState extends Schema {
  @type("string") code = "";
  @type("string") phase: Phase = "lobby";
  @type("number") hauntLevel = 0; // 0..100
  @type("number") sealProgress = 0; // 0..100
  @type("number") totalTasks = 0;
  @type("number") doorLockExpiresAt = 0; // unix ms
  @type("number") lightsOutExpiresAt = 0; // unix ms
  @type({ map: "number" }) sabotageCooldowns = new MapSchema<number>();
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Task }) tasks = new MapSchema<Task>();
  @type(Meeting) meeting = new Meeting();
  @type(Ritual) ritual = new Ritual();
  @type("number") nextRitualAt = 0;
  @type("string") winner = "";
  @type("string") winReason = "";
}
