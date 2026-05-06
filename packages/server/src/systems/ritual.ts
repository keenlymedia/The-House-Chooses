import {
  RITUAL_DECK_AWAKENING,
  RITUAL_DECK_SEAL,
  type RitualCard,
} from "@house/shared";
import type { MatchState } from "../state/MatchState.js";

// Server-only deck. Cards are NEVER placed on shared state — only the leader
// and witness see private hands via per-client send.
export class RitualDeck {
  private cards: RitualCard[] = [];

  constructor() {
    this.reshuffle();
  }

  reshuffle(): void {
    const next: RitualCard[] = [];
    for (let i = 0; i < RITUAL_DECK_SEAL; i++) next.push("seal");
    for (let i = 0; i < RITUAL_DECK_AWAKENING; i++) next.push("awakening");
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    this.cards = next;
  }

  // Draw `n` cards. Reshuffles automatically if depleted.
  draw(n: number): RitualCard[] {
    if (this.cards.length < n) this.reshuffle();
    return this.cards.splice(0, n);
  }

  size(): number {
    return this.cards.length;
  }
}

// Round-robin leader queue. Skips dead/banished players. Refills from alive
// once exhausted so leadership keeps rotating across long matches.
export class LeaderQueue {
  private queue: string[] = [];

  initialize(playerIds: string[]): void {
    this.queue = [...playerIds];
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
    }
  }

  next(state: MatchState): string | null {
    while (this.queue.length > 0) {
      const candidate = this.queue.shift()!;
      this.queue.push(candidate);
      const player = state.players.get(candidate);
      if (player?.alive && !player.banished) return candidate;
    }
    // Fallback: rebuild from current alive players.
    const alive: string[] = [];
    state.players.forEach((p, id) => {
      if (p.alive && !p.banished) alive.push(id);
    });
    if (alive.length === 0) return null;
    this.queue = alive;
    const next = this.queue.shift()!;
    this.queue.push(next);
    return next;
  }

  remove(id: string): void {
    this.queue = this.queue.filter((x) => x !== id);
  }
}

// Tally ritual approve/reject. Strict majority of voters wins; tie → reject.
export function tallyRitualVote(state: MatchState): "approve" | "reject" {
  let approve = 0;
  let reject = 0;
  state.ritual.votes.forEach((v) => {
    if (v === "approve") approve++;
    else if (v === "reject") reject++;
  });
  return approve > reject ? "approve" : "reject";
}
