import Phaser from "phaser";
import type { Room } from "colyseus.js";
import {
  C2S,
  DOOR_TILES,
  MAP_HEIGHT,
  MAP_WIDTH,
  PLAYER_RADIUS,
  ROOMS,
  S2C,
  TASK_INTERACT_RADIUS,
  TASK_LABELS,
  TILE,
  buildTileGrid,
  type PongPayload,
  type TaskType,
} from "@house/shared";

export interface DebugSink {
  setPing: (ms: number) => void;
}

export interface InteractionSink {
  setActive: (info: { taskType: TaskType; progress: number } | null) => void;
  setPrompt: (label: string | null) => void;
}

interface PlayerSprite {
  body: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  targetX: number;
  targetY: number;
  color: string;
}

interface TaskMarker {
  marker: Phaser.GameObjects.Container;
  ring: Phaser.GameObjects.Arc;
  dot: Phaser.GameObjects.Arc;
  task: ServerTask;
}

interface ServerPlayer {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
}

interface ServerTask {
  id: string;
  type: TaskType;
  x: number;
  y: number;
  durationMs: number;
  complete: boolean;
  cursed: boolean;
  urgent: boolean;
}

const TASK_COLOR = 0xffd25e;
const TASK_DONE_COLOR = 0x4a4356;
const TASK_URGENT_COLOR = 0xff5e5e;
const TASK_CURSED_COLOR = 0xc45eff;
const DOOR_LOCK_COLOR = 0xff5e5e;

export class MansionScene extends Phaser.Scene {
  private grid = buildTileGrid();
  private sprites = new Map<string, PlayerSprite>();
  private taskMarkers = new Map<string, TaskMarker>();
  private doorOverlays: Phaser.GameObjects.Rectangle[] = [];
  private keys!: Record<"W" | "A" | "S" | "D" | "E", Phaser.Input.Keyboard.Key>;
  private lastSentDx = 0;
  private lastSentDy = 0;
  private pingAccum = 0;

  // Active interaction state (client-side timing). Server validates.
  private activeInteraction: {
    taskId: string;
    type: TaskType;
    durationMs: number;
    startedAt: number;
    finished: boolean;
  } | null = null;

  constructor(
    private readonly room: Room,
    private readonly debug: DebugSink,
    private readonly interaction: InteractionSink,
  ) {
    super("MansionScene");
  }

  create(): void {
    this.drawMap();

    this.cameras.main.setBounds(0, 0, MAP_WIDTH * TILE, MAP_HEIGHT * TILE);
    this.cameras.main.setBackgroundColor("#0a0910");

    const kb = this.input.keyboard;
    if (!kb) throw new Error("keyboard input unavailable");
    this.keys = kb.addKeys("W,A,S,D,E") as typeof this.keys;

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

    // Door overlays — invisible until lock activates.
    for (const [tx, ty] of DOOR_TILES) {
      const r = this.add
        .rectangle(tx * TILE, ty * TILE, TILE, TILE, DOOR_LOCK_COLOR, 0)
        .setOrigin(0, 0)
        .setStrokeStyle(0, DOOR_LOCK_COLOR, 0);
      this.doorOverlays.push(r);
    }
  }

  update(_t: number, dtMs: number): void {
    this.reconcileSprites();
    this.reconcileTasks();
    this.reconcileDoors();
    this.handleInput();
    this.lerpSprites(dtMs);
    this.tickInteraction();
    this.ping(dtMs);
  }

  private reconcileDoors(): void {
    const expiresAt =
      (this.room.state as { doorLockExpiresAt?: number }).doorLockExpiresAt ?? 0;
    const locked = expiresAt > Date.now();
    for (const r of this.doorOverlays) {
      r.setFillStyle(DOOR_LOCK_COLOR, locked ? 0.35 : 0);
    }
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

  private reconcileTasks(): void {
    const seen = new Set<string>();
    const tasks = this.room.state.tasks as unknown as {
      forEach: (cb: (t: ServerTask, id: string) => void) => void;
    } | undefined;
    if (!tasks) return;

    tasks.forEach((t, id) => {
      seen.add(id);
      let marker = this.taskMarkers.get(id);
      if (!marker) {
        marker = this.createTaskMarker(t);
        this.taskMarkers.set(id, marker);
      }
      let color = TASK_COLOR;
      if (t.complete) color = TASK_DONE_COLOR;
      else if (t.urgent) color = TASK_URGENT_COLOR;
      else if (t.cursed) color = TASK_CURSED_COLOR;
      marker.dot.setFillStyle(color);
      marker.ring.setStrokeStyle(1, color, t.complete ? 0.25 : 0.5);
      marker.task = t;
    });

    for (const id of [...this.taskMarkers.keys()]) {
      if (!seen.has(id)) {
        const m = this.taskMarkers.get(id);
        m?.marker.destroy();
        this.taskMarkers.delete(id);
      }
    }
  }

  private createTaskMarker(t: ServerTask): TaskMarker {
    const ring = this.add.circle(0, 0, TASK_INTERACT_RADIUS);
    ring.setStrokeStyle(1, TASK_COLOR, 0.45);
    const dot = this.add.circle(0, 0, 6, TASK_COLOR);
    const container = this.add.container(t.x, t.y, [ring, dot]);
    container.setDepth(-1);
    return { marker: container, ring, dot, task: t };
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

  private handleInput(): void {
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

    const nearby = this.findNearestTask();
    this.interaction.setPrompt(
      !this.activeInteraction && nearby
        ? `Hold E — ${TASK_LABELS[nearby.type]}`
        : null,
    );

    const eDown = this.keys.E.isDown;
    if (eDown && !this.activeInteraction && nearby && !nearby.complete) {
      this.startInteraction(nearby);
    } else if (!eDown && this.activeInteraction) {
      this.cancelInteraction();
    } else if (this.activeInteraction) {
      // If we wandered away, cancel.
      const stillNear = nearby && nearby.id === this.activeInteraction.taskId;
      if (!stillNear) this.cancelInteraction();
    }
  }

  private findNearestTask(): ServerTask | null {
    const me = this.sprites.get(this.room.sessionId);
    if (!me) return null;
    let best: { task: ServerTask; d: number } | null = null;
    for (const m of this.taskMarkers.values()) {
      if (m.task.complete) continue;
      const d = Math.hypot(me.body.x - m.task.x, me.body.y - m.task.y);
      if (d > TASK_INTERACT_RADIUS) continue;
      if (!best || d < best.d) best = { task: m.task, d };
    }
    return best?.task ?? null;
  }

  private startInteraction(task: ServerTask): void {
    this.activeInteraction = {
      taskId: task.id,
      type: task.type,
      durationMs: task.durationMs,
      startedAt: performance.now(),
      finished: false,
    };
    this.room.send(C2S.TaskStart, { taskId: task.id });
  }

  private cancelInteraction(): void {
    if (!this.activeInteraction) return;
    if (!this.activeInteraction.finished) {
      this.room.send(C2S.TaskCancel, {});
    }
    this.activeInteraction = null;
    this.interaction.setActive(null);
  }

  private tickInteraction(): void {
    if (!this.activeInteraction || this.activeInteraction.finished) return;
    const elapsed = performance.now() - this.activeInteraction.startedAt;
    const progress = Math.min(1, elapsed / this.activeInteraction.durationMs);
    this.interaction.setActive({
      taskType: this.activeInteraction.type,
      progress,
    });
    if (progress >= 1) {
      this.activeInteraction.finished = true;
      this.room.send(C2S.TaskFinish, { taskId: this.activeInteraction.taskId });
      this.activeInteraction = null;
      this.interaction.setActive(null);
    }
  }

  private lerpSprites(dtMs: number): void {
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

function parseColor(hex: string): number {
  const cleaned = hex.startsWith("#") ? hex.slice(1) : hex;
  return parseInt(cleaned, 16) || 0x9b6bff;
}
