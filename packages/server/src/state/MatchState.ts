import { Schema, MapSchema, type } from "@colyseus/schema";
import type { Phase } from "@house/shared";

export class Player extends Schema {
  @type("string") id = "";
  @type("string") name = "";
  @type("boolean") isHost = false;
  @type("boolean") ready = false;
  @type("boolean") alive = true;
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") fear = 0;
}

export class MatchState extends Schema {
  @type("string") code = "";
  @type("string") phase: Phase = "lobby";
  @type("number") hauntLevel = 0;
  @type({ map: Player }) players = new MapSchema<Player>();
}
