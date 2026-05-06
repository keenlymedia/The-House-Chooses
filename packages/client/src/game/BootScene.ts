import Phaser from "phaser";
import type { Room } from "colyseus.js";

// Placeholder scene for step 1. Real movement, tilemap, and synced player
// sprites land in step 2 (movement) and step 3 (mansion map).
export class BootScene extends Phaser.Scene {
  constructor(private readonly _room: Room) {
    super("BootScene");
  }

  create(): void {
    this.add
      .text(480, 240, "The match has begun.", {
        fontFamily: "ui-sans-serif, system-ui",
        fontSize: "28px",
        color: "#e8e6ea",
      })
      .setOrigin(0.5);

    this.add
      .text(480, 290, "Movement and the mansion arrive in step 2.", {
        fontFamily: "ui-sans-serif, system-ui",
        fontSize: "14px",
        color: "#8c869a",
      })
      .setOrigin(0.5);
  }
}
