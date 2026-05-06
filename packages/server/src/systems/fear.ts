import { roomAt } from "@house/shared";
import type { MatchState } from "../state/MatchState.js";

const NEAR_BUDDY_PX = 80;
const ALONE_PX = 150;
const ALONE_GRACE_MS = 5_000;

const RATE = {
  aloneTooLong: +1.0,
  lightsOut: +0.5,
  cursedRoom: +0.5,
  nearBuddy: -0.3,
  inChapel: -1.0,
};

export class FearSystem {
  // Last tick the player was either close to a buddy or in transit (so the
  // grace period for "alone too long" doesn't tick down spuriously).
  private aloneSince = new Map<string, number>();

  // Called once per second from the room. dtSec is forced to 1.
  update(state: MatchState, now: number, dtSec: number): void {
    state.players.forEach((player, id) => {
      if (!player.alive || player.banished) return;

      let delta = 0;

      // Alone-vs-buddy: check nearest other alive player.
      let nearestDist = Infinity;
      state.players.forEach((other, otherId) => {
        if (otherId === id) return;
        if (!other.alive || other.banished) return;
        const d = Math.hypot(other.x - player.x, other.y - player.y);
        if (d < nearestDist) nearestDist = d;
      });

      if (nearestDist <= NEAR_BUDDY_PX) {
        delta += RATE.nearBuddy;
        this.aloneSince.set(id, now);
      } else if (nearestDist >= ALONE_PX) {
        const since = this.aloneSince.get(id);
        if (since == null) {
          this.aloneSince.set(id, now);
        } else if (now - since >= ALONE_GRACE_MS) {
          delta += RATE.aloneTooLong;
        }
      } else {
        this.aloneSince.set(id, now);
      }

      // Lights out anywhere on the map raises fear (vision pressure).
      if (state.lightsOutExpiresAt > now) delta += RATE.lightsOut;

      // Room-based modifiers.
      const room = roomAt(player.x, player.y);
      if (room) {
        if (room.id === "chapel") delta += RATE.inChapel;

        let cursedHere = false;
        state.tasks.forEach((t) => {
          if (t.complete) return;
          if (!t.cursed) return;
          if (t.roomId !== room.id) return;
          cursedHere = true;
        });
        if (cursedHere) delta += RATE.cursedRoom;
      }

      player.fear = clamp(player.fear + delta * dtSec, 0, 100);
    });
  }

  // Drop tracking for a player who left or was banished.
  forget(id: string): void {
    this.aloneSince.delete(id);
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
