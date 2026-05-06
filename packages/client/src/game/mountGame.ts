import Phaser from "phaser";
import type { Room } from "colyseus.js";
import { BootScene } from "./BootScene.js";

export interface GameHandle {
  destroy: () => void;
}

export function mountGame(parent: HTMLElement, room: Room): GameHandle {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: 960,
    height: 540,
    backgroundColor: "#0a0910",
    scene: [new BootScene(room)],
    physics: { default: "arcade" },
  });

  return {
    destroy: () => game.destroy(true),
  };
}
