# Bug + Architecture Audit (post step 11)

Scope: every commit on the `claude/horror-deduction-game-F8PFz` branch through "Polish lighting, audio cues, and mobile warning". Read all server systems and client UI; called out only real, reproducible findings — no generic checklist filler.

## Readiness score

**61 / 100.** Playable end-to-end with 6+ players. Core systems are server-authoritative and validate role/phase/distance/time correctly. Two **critical** issues block any public test: votes are not actually secret (they ride in shared state), and a stale ritual timeout from a previous match can corrupt the next ritual after a host restart. Reconnection isn't supported. Audit + fix the criticals first; the rest is incremental.

---

## 1. Critical bugs

### C1. Vote secrecy is broken — meeting + ritual votes are broadcast in shared state

`state.meeting.votes` and `state.ritual.votes` are `MapSchema<string>` keyed by `voterId` → `target`/`approve`/`reject`. Colyseus broadcasts the full state diff to every client. The client UI hides the targets, but a determined player can open DevTools and read `room.state.meeting.votes` directly to see exactly who voted for whom.

This is exactly the exploit the prompt called out: "voting exploits".

**Fix (server, single PR):**
- Replace `votes: MapSchema<string>` with two fields:
  - `voterIds: ArraySchema<string>` — public, only "who has voted" (current `voters` Set).
  - private `Map<sessionId, vote>` on `MansionRoom`, never put on state.
- Move `tallyMeeting`/`tallyRitualVote` onto the private map.
- `useRoomState` already builds a `voters` Set from the public field; no client change once the schema name matches.

### C2. Stale ritual `clock.setTimeout` callbacks fire into the *next* match after a restart

Several setTimeouts in MansionRoom guard with `if (this.state.phase === "ritual" && this.state.ritual.subPhase === "leaderDraw")`. After a host restart, the next match can re-enter the same `ritual / leaderDraw` state. A leftover timer from the previous match then fires `applyLeaderDiscard(0)` on the *current* leader hand, which silently discards an arbitrary card.

This is reproducible: start a match → enter ritual → approve → leader is sent 3 cards → host calls restart before the leader picks → start a new match → enter ritual again → the prior 30s timer fires while the new leader is still thinking.

**Fix (server, ~30 lines):**
- Add `private ritualEpoch = 0` on the room, increment in `startRitual()` and `resetForRestart()`.
- Each setTimeout captures `const epoch = this.ritualEpoch;` and bails on fire if `this.ritualEpoch !== epoch`.
- Same pattern for the meeting discussion/vote setTimeouts and the post-meeting "resume play" timeout (lower impact but the same class of bug).

### C3. Host can be reassigned to a banished or dead player

`onLeave` picks the new host with `this.state.players.values().next().value` — the first iteration entry. That includes banished players (alive=false, banished=true). A banished spectator becoming host can then send `RestartLobby` while the rest of the room is still mid-match — `handleRestartLobby` only checks `phase === "ended"`, so this would no-op, but if the bug compounds with future host-only actions (e.g., kick) it becomes a route to grief.

**Fix:** in `onLeave`, iterate to the first `alive && !banished` player. Fall back to any player if none are alive.

---

## 2. High-priority issues

### H1. No reconnection support

Per the MVP spec, the server should preserve a player's slot for ~60s on disconnect and restore on rejoin. Today `onLeave` immediately deletes the player from `state.players` and clears all server-side maps for that sessionId. A flaky network drops a player permanently and they re-join as a brand-new participant who can't recover their role/team.

**Fix path:**
1. Use Colyseus' `allowReconnection(client, 60)` inside `onLeave`. Don't mutate state until that promise rejects.
2. On rejoin (the `onLeave` handler resumes), keep the existing Player entry; refresh the client's role with `sendRole`.
3. The client `Landing` flow needs a "rejoin" button or auto-rejoin via stored sessionId in localStorage. Out of scope for this audit — but note it.

### H2. `MansionScene` registers an `S2C.Pong` listener that never unregisters

`scene.create()` calls `this.room.onMessage(S2C.Pong, …)` once. Phaser destroying the scene doesn't drop the Colyseus listener — the closure captures `this.debug`, which is captured by `mountGame`. If the GameScreen unmounts and remounts (React StrictMode in dev or a future router), each mount adds a new listener and the old one keeps invoking a stale `setPing`.

**Fix:** capture the unsubscribe handle in `create()` and call it from `shutdown()` / scene destruction.

### H3. `room.state.meeting.lastBanishedId` never clears

It's set on resolve, but the next meeting only clears `votes`, `discussionEndsAt`, `voteEndsAt`, and `calledBy` — `lastBanishedId` lingers and is shown by the meeting overlay during the next meeting until a new banishment occurs (or the meeting ends without a banish, which clears it via the same path... actually it's only set when `outcome.banishedId` is non-null, so a tied no-banish meeting still shows the *previous* meeting's banished name).

**Fix:** set `lastBanishedId = ""` in `startMeeting()` (already there) — but ALSO in `resolveVoting()`'s no-banish path, since the overlay reads it before the next `startMeeting`.

### H4. Win-check doesn't run on every fear-driven kill / future kill action

Currently `checkAndMaybeConclude` runs after sabotage and task completion. When step 10's kill action lands, it must call this helper. Document this as a contract on the helper itself with a JSDoc comment. (Pre-emptive — but easy to forget.)

### H5. The mansion has no way to physically separate dead/banished players

`alive=false, banished=true` means the player can't move (Move handler bails) and can't interact, but their *body* is still rendered at the position they were standing in. If the kill action lands later, the body becomes evidence — fine. But banished players currently leave a sprite in the foyer, which is confusing visually.

**Fix:** when banishing, move the sprite off-screen (e.g., x = -1000) or render banished players with low alpha + a "spectating" outline. Cosmetic but worth doing before the next playtest.

---

## 3. Medium-priority issues

### M1. Sabotage cooldown after a restart is preserved

`resetForRestart` calls `state.sabotageCooldowns.clear()`, which is correct. But if a sabotage fires *just before* `RestartLobby` resolves, the haunt + cooldown changes happen in the same tick — there's a tiny window where the broadcast goes out with stale cooldowns. Not exploitable, just visually weird.

**Fix:** none required for MVP. Note for tracking.

### M2. `pickSpawn` is O(players × spawn_points) and can return overlapping positions when 12 players join simultaneously

Each onJoin iterates 12 spawn points checking distances against existing players. With 12 simultaneous joins (rare but possible), order-dependent behavior may put 2 players within 16px. Real but unlikely.

**Fix:** turn the spawn-point list into a queue; pop from the front per join. Round-robin.

### M3. The room-code map is in-process

Documented in the README. Single Node process is fine for MVP. When this scales to multiple instances, codes will collide and `/code/:code` lookups will only see the local instance. Move to Redis or Colyseus' built-in matchmaker by-name lookups before deploying past one host.

### M4. `state.players` exposes `Player.fear` to all clients

Fear is currently public. It's used by the local meter only, but a corrupted player can read every other player's fear value out of state — useful for picking who's about to be Panicked and who's about to break. Whether this is intended cat-and-mouse or a leak depends on game design. Flag for design discussion.

### M5. `MansionRoom` uses both `Date.now()` and `this.clock.currentTime`

Mostly `Date.now()`. Using one source of time consistently reduces ambiguity for testing and future timewarp/test mode work. Pick `this.clock.currentTime` everywhere on the server (it pauses with the room) and bake time into helper signatures.

### M6. The `roles.ts` distribution table will silently throw for player counts outside 6–12

`assignRoles` throws inside `handleStartMatch`. The handler doesn't catch — Colyseus will surface the error and the start fails server-side. The client got `unsupported_player_count` already from the explicit pre-check, so the throw is unreachable in practice, but it's still dead-throw code that should be a soft error if reached.

**Fix:** return null and have the caller error out. Keeps the room alive on a hypothetical bug.

### M7. There's no rate-limit on `setName`

A spammy client could rename themselves 1000×/sec. Server stores it on shared state, which broadcasts diffs. Not a real exploit, but bandwidth-wasteful.

**Fix:** debounce on the server (250ms) or just cap to once per second per session.

### M8. The Phaser camera follow uses a 0.15 lerp — the screen-centered CSS lighting overlay drifts when the camera catches up

Polished lighting works *because* the camera follows the player, but the lerp factor means the player can be ~30px off-center for a frame or two. The vignette feels right at low fear; at high fear with the panic shake, the offset compounds. Cosmetic, low priority.

**Fix:** 0.25 lerp factor for tighter centering, or render the lighting in Phaser.

---

## 4. Nice-to-have improvements

- **N1.** Generate Colyseus schema TS types instead of casting `room.state as { ... }` in `useRoomState`. Fixes a pile of `?? 0` defaults.
- **N2.** Move `audio/` to `client/src/lib/audio/` to mirror future `lib/` peers.
- **N3.** A single `messages.ts` file for all C2S/S2C wire types is fine at this size but could split per-system once the file passes ~250 lines.
- **N4.** Tests: zero so far. The first test worth writing is `tallyMeeting` — pure function, easy, catches real votes-tied edge cases.
- **N5.** README is missing a "How to run tests" section because there are no tests. Add a vitest setup as part of N4.
- **N6.** `dist/` outputs are not currently produced by the workspace `build` script (`@house/shared` has `noEmit: true` for typecheck). When deploying, the server build will need shared compiled. Document or add a real shared build.
- **N7.** Server logging is `console.log`. Pino + structured fields would help the inevitable "what happened in that 6-player match" question.
- **N8.** Add a `dev:bots` script (step 12 work) that spawns N headless Colyseus clients connected to a code, picks roles, and presses Ready. Tests the lobby + reveal end-to-end.

---

## 5. Security / cheat risks

| Risk | Mitigation status | Action |
|---|---|---|
| Role spoofing | **Fully mitigated.** Roles never enter shared state; every role-gated action looks up `this.roles.get(sessionId)`. | None. |
| Vote target reveal | **Not mitigated.** See C1. | C1 fix. |
| Ritual card peek | **Mitigated.** Hands are server-only fields, sent per-recipient. | None. |
| Task fast-completion | **Mitigated.** Server timestamps `startedAt`, validates `elapsed >= duration − 250ms`. | None. |
| Sabotage cooldown bypass | **Mitigated.** Cooldown stored in shared state, but server checks against `Date.now()`. Client UI cannot influence the gate. | None. |
| Move-to-arbitrary-position | **Mitigated.** Client sends `{dx, dy}` intent, never raw position. Server simulates. | None. |
| Forged `taskFinish` for another player's task | **Mitigated.** Per-sessionId interaction map; finishing requires you to have started. | None. |
| Forged `RitualDiscard` from non-leader | **Mitigated.** Sender id check. | None. |
| Self-vote in meeting | **Not blocked.** Server lets you vote for yourself. Probably intended? | Design call. |
| Self-nominate as witness | **Blocked** (`if (witnessId === r.leaderId) return;`). | None. |

---

## 6. Multiplayer stability risks

- **R1.** Colyseus `setSimulationInterval` runs at 50ms. With 12 players moving + fear ticking + ritual scheduling, single-tick CPU is well under budget for Node on a modest VPS. Stable.
- **R2.** State diff size: with all the new ritual/meeting/sabotageCooldowns/tasks fields, the steady-state state size is ~3 KB per player. Move-only diffs are tiny. No concern.
- **R3.** Reconnection: see H1. Currently a single packet drop ends a player's match.
- **R4.** Phaser canvas memory: each `mountGame` creates a `Phaser.Game` and `destroy(true)` reclaims it. No leak observed in dev, but the unregistered `onMessage` listener (H2) is the most likely accumulator.
- **R5.** No backpressure on broadcasts. With 12 clients and a 50ms tick where every tick mutates positions, that's ~3KB × 12 × 20Hz ≈ 720KB/s outbound. Fine for a dev VPS, will need monitoring before public test.

---

## 7. Folder organization + TypeScript safety

- `packages/shared` is in good shape: constants, types, messages, map, tasks, sabotage. The implicit dep cycle risk (map ← constants ← messages ← types) doesn't trip because every cross-import is type-only or one-direction.
- `packages/server/src/systems/` is the right place; the room file (`MansionRoom.ts`) is at ~530 lines and starting to deserve a split — handlers vs simulation vs lifecycle. Not urgent, but the next step (kill action) will tip it past 600.
- `packages/client/src/ui/*` is per-overlay one component per file. Good. `useRoomState` is one of three React hooks; if it grows, fold into `state/` to mirror server layout.
- TypeScript: no `any`s except in the type-loose schema reads. Strict mode is on. The `as unknown as` casts in `useRoomState` should be replaced when Colyseus generates client types (N1).

---

## 8. Exact fixes in implementation order

The order is chosen so each step is independently shippable and earlier fixes don't conflict with later ones.

1. **C1 — Hide votes from shared state** (server schema + handler change, client only consumes the existing `voters` Set). _~80 lines._
2. **C2 — Add `ritualEpoch` cancellation token** (`startRitual`, `resetForRestart`, every ritual setTimeout). _~25 lines._
3. **C3 — Pick alive-only host on `onLeave`**. _~6 lines._
4. **H3 — Reset `lastBanishedId` in resolveVoting's no-banish path**. _~2 lines._
5. **H2 — Capture and run the `S2C.Pong` unsubscribe in `MansionScene`**. _~4 lines._
6. **M6 — `assignRoles` returns null on bad count, caller errors**. _~10 lines._
7. **N4 — Add vitest + tests for `tallyMeeting`, `tallyRitualVote`, `checkWin`**. _~120 lines, ~30 min._
8. **H1 — Reconnection** (Colyseus `allowReconnection`, client storage). _Larger; own PR. ~150 lines._
9. **N1 — Generate Colyseus types**, replace `useRoomState` casts. _Tooling task._
10. Step 12 of the build order (dev test mode bots) lands afterward.

That's the audit. Once C1 and C2 are in, this is publicly playtestable; H1 is what gets it ready for tournaments.
