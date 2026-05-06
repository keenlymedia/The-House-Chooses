import {
  ROOMS,
  TASK_DURATIONS_MS,
  TASK_TYPES,
  TILE,
  type TaskType,
  type TileGrid,
} from "@house/shared";
import { Task } from "../state/MatchState.js";

const TASKS_PER_ROOM = 2;
const MIN_SPACING_PX = 80;

interface SpawnedTask {
  id: string;
  type: TaskType;
  roomId: string;
  x: number;
  y: number;
  durationMs: number;
}

export function spawnTasksForMatch(grid: TileGrid): SpawnedTask[] {
  const tasks: SpawnedTask[] = [];
  let typeCursor = 0;
  for (const room of ROOMS) {
    const placed: Array<{ x: number; y: number }> = [];
    let attempts = 0;
    while (placed.length < TASKS_PER_ROOM && attempts < 80) {
      attempts++;
      const tx = room.x + 1 + Math.floor(Math.random() * (room.w - 2));
      const ty = room.y + 1 + Math.floor(Math.random() * (room.h - 2));
      if (grid[ty]?.[tx] !== 0) continue;
      const wx = tx * TILE + TILE / 2;
      const wy = ty * TILE + TILE / 2;
      if (placed.some((p) => Math.hypot(p.x - wx, p.y - wy) < MIN_SPACING_PX)) {
        continue;
      }
      placed.push({ x: wx, y: wy });
      const type = TASK_TYPES[typeCursor++ % TASK_TYPES.length];
      tasks.push({
        id: `${room.id}-${placed.length}`,
        type,
        roomId: room.id,
        x: wx,
        y: wy,
        durationMs: TASK_DURATIONS_MS[type],
      });
    }
  }
  return tasks;
}

export function buildTaskSchema(spec: SpawnedTask): Task {
  const t = new Task();
  t.id = spec.id;
  t.type = spec.type;
  t.roomId = spec.roomId;
  t.x = spec.x;
  t.y = spec.y;
  t.durationMs = spec.durationMs;
  t.complete = false;
  return t;
}
