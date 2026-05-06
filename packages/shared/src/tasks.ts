export const TASK_TYPES = [
  "lightCandle",
  "repairFuseBox",
  "collectRitualPage",
  "cleanCursedSymbol",
  "placeRelic",
] as const;

export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_DURATIONS_MS: Record<TaskType, number> = {
  lightCandle: 2500,
  repairFuseBox: 4500,
  collectRitualPage: 2000,
  cleanCursedSymbol: 3000,
  placeRelic: 3500,
};

export const TASK_LABELS: Record<TaskType, string> = {
  lightCandle: "Light Candle",
  repairFuseBox: "Repair Fuse Box",
  collectRitualPage: "Collect Ritual Page",
  cleanCursedSymbol: "Clean Cursed Symbol",
  placeRelic: "Place Relic",
};

// Maximum distance (px) between the player center and the task to interact.
export const TASK_INTERACT_RADIUS = 48;

// Server tolerance on the duration check, in ms. Anything quicker than
// duration - tolerance is rejected as a likely cheat / desync.
export const TASK_DURATION_TOLERANCE_MS = 250;
