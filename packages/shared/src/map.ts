// Mansion map: a tile grid of walls and floors, plus named rooms and doors.
// Used by both server (collision + spawn) and client (rendering).

export const TILE = 32;
export const MAP_WIDTH = 40;  // tiles
export const MAP_HEIGHT = 25; // tiles

export const PLAYER_RADIUS = 12; // px
export const PLAYER_SPEED = 180; // px/s

export interface RoomDef {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export const ROOMS: RoomDef[] = [
  { id: "attic",       name: "Attic",        x: 1,  y: 1,  w: 11, h: 7 },
  { id: "library",     name: "Library",      x: 14, y: 1,  w: 11, h: 7 },
  { id: "nursery",     name: "Nursery",      x: 27, y: 1,  w: 12, h: 7 },
  { id: "servantHall", name: "Servant Hall", x: 1,  y: 10, w: 11, h: 6 },
  { id: "foyer",       name: "Foyer",        x: 14, y: 10, w: 11, h: 6 },
  { id: "diningHall",  name: "Dining Hall",  x: 27, y: 10, w: 12, h: 6 },
  { id: "chapel",      name: "Chapel",       x: 1,  y: 18, w: 8,  h: 6 },
  { id: "garden",      name: "Garden",       x: 11, y: 18, w: 8,  h: 6 },
  { id: "ritualRoom",  name: "Ritual Room",  x: 21, y: 18, w: 8,  h: 6 },
  { id: "basement",    name: "Basement",     x: 31, y: 18, w: 8,  h: 6 },
];

// Each entry is a tile that should be carved out of the wall band between rooms.
export const DOOR_TILES: ReadonlyArray<readonly [number, number]> = [
  // top row to middle row (vertical openings, 2 tiles tall)
  [6, 8], [6, 9],
  [19, 8], [19, 9],
  [33, 8], [33, 9],
  // middle row to bottom row
  [5, 16], [5, 17],
  [17, 16], [17, 17],
  [25, 16], [25, 17],
  [34, 16], [34, 17],
  // attic ↔ library, library ↔ nursery (horizontal, 2 tiles wide)
  [12, 4], [13, 4],
  [25, 4], [26, 4],
  // servantHall ↔ foyer, foyer ↔ diningHall
  [12, 12], [13, 12],
  [25, 12], [26, 12],
  // chapel ↔ garden, garden ↔ ritualRoom, ritualRoom ↔ basement
  [9, 21], [10, 21],
  [19, 21], [20, 21],
  [29, 21], [30, 21],
];

export const SPAWN_POINTS: ReadonlyArray<readonly [number, number]> = [
  // around foyer center, in tile coords
  [19, 13], [20, 13], [18, 13],
  [19, 12], [20, 12], [18, 12],
  [19, 14], [20, 14], [18, 14],
  [21, 13], [17, 13], [21, 12],
];

// 0 = floor, 1 = wall
export type TileGrid = ReadonlyArray<ReadonlyArray<0 | 1>>;

export function buildTileGrid(): TileGrid {
  const grid: (0 | 1)[][] = [];
  for (let y = 0; y < MAP_HEIGHT; y++) {
    const row: (0 | 1)[] = [];
    for (let x = 0; x < MAP_WIDTH; x++) row.push(1);
    grid.push(row);
  }
  for (const room of ROOMS) {
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        grid[y][x] = 0;
      }
    }
  }
  for (const [x, y] of DOOR_TILES) {
    if (grid[y]?.[x] !== undefined) grid[y][x] = 0;
  }
  return grid;
}

// World-space spawn coordinates (px), in stable order for assignment.
export function spawnPositions(): Array<{ x: number; y: number }> {
  return SPAWN_POINTS.map(([tx, ty]) => ({
    x: tx * TILE + TILE / 2,
    y: ty * TILE + TILE / 2,
  }));
}

// Collision check: can the circle of radius r at (x, y) px stand on floor?
// When `lockedDoors` is provided, door tiles are treated as walls.
export function canStand(
  grid: TileGrid,
  x: number,
  y: number,
  r: number = PLAYER_RADIUS,
  lockedDoors?: ReadonlySet<string>,
): boolean {
  const offsets: Array<[number, number]> = [
    [-r, -r], [r, -r], [-r, r], [r, r],
  ];
  for (const [dx, dy] of offsets) {
    const tx = Math.floor((x + dx) / TILE);
    const ty = Math.floor((y + dy) / TILE);
    if (tx < 0 || ty < 0 || tx >= MAP_WIDTH || ty >= MAP_HEIGHT) return false;
    if (grid[ty][tx] === 1) return false;
    if (lockedDoors && lockedDoors.has(tileKey(tx, ty))) return false;
  }
  return true;
}

export function tileKey(tx: number, ty: number): string {
  return `${tx},${ty}`;
}

export function doorTileKeys(): Set<string> {
  return new Set(DOOR_TILES.map(([x, y]) => tileKey(x, y)));
}

export function roomAt(x: number, y: number): RoomDef | null {
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  for (const room of ROOMS) {
    if (
      tx >= room.x &&
      tx < room.x + room.w &&
      ty >= room.y &&
      ty < room.y + room.h
    ) {
      return room;
    }
  }
  return null;
}
