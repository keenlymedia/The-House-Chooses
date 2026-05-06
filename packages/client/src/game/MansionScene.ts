import Phaser from "phaser";
import type { Room } from "colyseus.js";
import {
  C2S,
  MAP_HEIGHT,
  MAP_WIDTH,
  PLAYER_RADIUS,
  ROOMS,
  S2C,
  TILE,
  buildTileGrid,
  type PongPayload,
} from "@house/shared";

export interface DebugSink {
  setPing: (ms: number) => void;
}

interface PlayerSprite {
  body: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  targetX: number;
  targetY: number;
  color: string;
}

export class MansionScene extends Phaser.Scene {
  private grid = buildTileGrid();
  private sprites = new Map<string, PlayerSprite>();
  private keys!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;
  private lastSentDx = 0;
  private lastSentDy = 0;
  private pingAccum = 0;

  constructor(
    private readonly room: Room,
    private readonly debug: DebugSink,
  ) {
    super("MansionScene");
  }

  create(): void {
    this.drawMap();

    this.cameras.main.setBounds(0, 0, MAP_WIDTH * TILE, MAP_HEIGHT * TILE);
    this.cameras.main.setBackgroundColor("#0a0910");

    const kb = this.input.keyboard;
    if (!kb) throw new Error("keyboard input unavailable");
    this.keys = kb.addKeys("W,A,S,D") as typeof this.keys;

    this.room.onMessage(S2C.Pong, (msg: PongPayload) => {
      const rt = performance.now() - msg.t;
      this.debug.setPing(Math.round(rt));
    });
  }

  private drawMap(): void {
    const floor = this.add.graphics();
    floor.fillStyle(0x1d1a23);
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (this.grid[y][x] === 0) {
          floor.fillRect(x * TILE, y * TILE, TILE, TILE);
        }
      }
    }

    const walls = this.add.graphics();
    walls.lineStyle(2, 0x4a4356, 1);
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (this.grid[y][x] !== 0) continue;
        if (this.grid[y - 1]?.[x] === 1) {
          walls.lineBetween(x * TILE, y * TILE, (x + 1) * TILE, y * TILE);
        }
        if (this.grid[y + 1]?.[x] === 1) {
          walls.lineBetween(
            x * TILE,
            (y + 1) * TILE,
            (x + 1) * TILE,
            (y + 1) * TILE,
          );
        }
        if (this.grid[y]?.[x - 1] === 1) {
          walls.lineBetween(x * TILE, y * TILE, x * TILE, (y + 1) * TILE);
        }
        if (this.grid[y]?.[x + 1] === 1) {
          walls.lineBetween(
            (x + 1) * TILE,
            y * TILE,
            (x + 1) * TILE,
            (y + 1) * TILE,
          );
        }
      }
    }

    for (const room of ROOMS) {
      const cx = (room.x + room.w / 2) * TILE;
      const cy = (room.y + room.h / 2) * TILE;
      this.add
        .text(cx, cy, room.name.toUpperCase(), {
          fontFamily: "ui-sans-serif, system-ui",
          fontSize: "11px",
          color: "#3d3848",
        })
        .setOrigin(0.5)
        .setAlpha(0.7);
    }
  }

  update(_t: number, dtMs: number): void {
    this.reconcileSprites();
    this.sendInput();
    this.lerpSprites(dtMs);
    this.ping(dtMs);
  }

  private reconcileSprites(): void {
    const seen = new Set<string>();
    const players = this.room.state.players as unknown as {
      forEach: (cb: (p: ServerPlayer, id: string) => void) => void;
    };

    players.forEach((p, id) => {
      seen.add(id);
      let sprite = this.sprites.get(id);
      if (!sprite) {
        sprite = this.createSprite(p);
        this.sprites.set(id, sprite);
        if (id === this.room.sessionId) {
          this.cameras.main.startFollow(sprite.body, true, 0.15, 0.15);
        }
      }
      sprite.targetX = p.x;
      sprite.targetY = p.y;
      sprite.label.setText(p.name || "Player");
      if (sprite.color !== p.color) {
        sprite.color = p.color;
        sprite.body.setFillStyle(parseColor(p.color));
      }
    });

    for (const id of [...this.sprites.keys()]) {
      if (!seen.has(id)) this.removeSprite(id);
    }
  }

  private createSprite(p: ServerPlayer): PlayerSprite {
    const body = this.add.circle(p.x, p.y, PLAYER_RADIUS, parseColor(p.color));
    body.setStrokeStyle(2, 0x000000, 0.55);
    const label = this.add
      .text(p.x, p.y - PLAYER_RADIUS - 10, p.name || "Player", {
        fontFamily: "ui-sans-serif, system-ui",
        fontSize: "11px",
        color: "#e8e6ea",
        stroke: "#0a0910",
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    return { body, label, targetX: p.x, targetY: p.y, color: p.color };
  }

  private removeSprite(id: string): void {
    const sprite = this.sprites.get(id);
    if (!sprite) return;
    sprite.body.destroy();
    sprite.label.destroy();
    this.sprites.delete(id);
  }

  private sendInput(): void {
    let dx = 0;
    let dy = 0;
    if (this.keys.A.isDown) dx -= 1;
    if (this.keys.D.isDown) dx += 1;
    if (this.keys.W.isDown) dy -= 1;
    if (this.keys.S.isDown) dy += 1;
    if (dx !== this.lastSentDx || dy !== this.lastSentDy) {
      this.room.send(C2S.Move, { dx, dy });
      this.lastSentDx = dx;
      this.lastSentDy = dy;
    }
  }

  private lerpSprites(dtMs: number): void {
    // Reach the target in ~120ms; clamped so a long frame can't overshoot.
    const k = Math.min(1, dtMs / 120);
    for (const sprite of this.sprites.values()) {
      sprite.body.x += (sprite.targetX - sprite.body.x) * k;
      sprite.body.y += (sprite.targetY - sprite.body.y) * k;
      sprite.label.x = sprite.body.x;
      sprite.label.y = sprite.body.y - PLAYER_RADIUS - 10;
    }
  }

  private ping(dtMs: number): void {
    this.pingAccum += dtMs;
    if (this.pingAccum >= 1000) {
      this.pingAccum = 0;
      this.room.send(C2S.Ping, { t: performance.now() });
    }
  }
}

interface ServerPlayer {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
}

function parseColor(hex: string): number {
  const cleaned = hex.startsWith("#") ? hex.slice(1) : hex;
  return parseInt(cleaned, 16) || 0x9b6bff;
}
