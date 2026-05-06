export const SABOTAGE_TYPES = [
  "lightsOut",
  "doorLock",
  "falseWhisper",
  "curseObject",
  "breakFuseBox",
] as const;

export type SabotageType = (typeof SABOTAGE_TYPES)[number];

// How long the effect itself lasts (ms). 0 = instantaneous or until triggered.
export const SABOTAGE_DURATIONS_MS: Record<SabotageType, number> = {
  lightsOut: 30_000,
  doorLock: 20_000,
  falseWhisper: 0,
  curseObject: 0,
  breakFuseBox: 0,
};

// Time between the same sabotage being usable again (ms).
export const SABOTAGE_COOLDOWNS_MS: Record<SabotageType, number> = {
  lightsOut: 60_000,
  doorLock: 45_000,
  falseWhisper: 25_000,
  curseObject: 50_000,
  breakFuseBox: 75_000,
};

export const SABOTAGE_LABELS: Record<SabotageType, string> = {
  lightsOut: "Lights Out",
  doorLock: "Door Lock",
  falseWhisper: "False Whisper",
  curseObject: "Curse Object",
  breakFuseBox: "Break Fuse Box",
};

export const SABOTAGE_HOTKEYS: Record<SabotageType, string> = {
  lightsOut: "1",
  doorLock: "2",
  falseWhisper: "3",
  curseObject: "4",
  breakFuseBox: "5",
};

// Each sabotage adds this many points to hauntLevel (0..100).
export const SABOTAGE_HAUNT_GAIN = 8;
export const HAUNT_MAX = 100;

export const WHISPER_TEXTS: readonly string[] = [
  "behind you.",
  "they aren't who they say they are.",
  "the foyer remembers.",
  "look down. now.",
  "you were never alone in here.",
  "it's already inside you.",
  "don't trust the next vote.",
];

export const FEAR_FROM_CURSE = 25;
