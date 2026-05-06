import Phaser from "phaser";
import type { Room } from "colyseus.js";
import {
  MansionScene,
  type DebugSink,
  type InteractionSink,
} from "./MansionScene.js";

export interface GameHandle {
  destroy: () => void;
}

export function mountGame(
  parent: HTMLElement,
  room: Room,
  debug: DebugSink,
  interaction: InteractionSink,
): GameHandle {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: parent.clientWidth || 960,
    height: parent.clientHeight || 540,
    backgroundColor: "#050507",
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [new MansionScene(room, debug, interaction)],
  });

  return {
    destroy: () => game.destroy(true),
  };
}
