# The House Chooses — MVP Spec (v0.1)

Status: living document. Source of truth for what v0.1 ships and what it deliberately does not.

## 1. One-page overview

A browser multiplayer horror social deduction game. 6–12 players spawn in a haunted mansion. Most are **Survivors** completing tasks and rituals to seal the house. A few are **Corrupted**, sabotaging from within. One may be the **Vessel**, a hidden role whose mere selection during a late ritual hands the Corrupted the win.

Movement is Among Us. Politics are Secret Hitler. Atmosphere is Phasmophobia. The hook is **Fear**: a per-player meter that, when high, makes your own perception lie to you (false footsteps, fake bodies, ghost players, distorted UI).

Match length: 12–20 minutes. Each match has 3–5 rituals interspersed with task/sabotage gameplay and emergency meetings.

## 2. Player experience loop

```
Spawn ─► Roam mansion + complete tasks
                 │
                 ▼
        Sabotage / haunting hits
                 │
                 ▼
       Discover body / call meeting
                 │
                 ▼
              Vote / discuss
                 │
                 ▼
          Resume mansion play
                 │
                 ▼
   Ritual phase (Leader + Witness vote)
                 │
                 ▼
         Haunting level changes
                 │
                 ▼
         Repeat until win/loss
```

Survivor minute-to-minute: pick the next task, watch the corner of your eye, decide who to trust. Corrupted minute-to-minute: fake tasks, time sabotages, frame, protect the Vessel.

## 3. MVP features (v0.1)

1. Lobby with 4-letter room code (✅ shipped in step 1)
2. 6–12 player support (min 4 for testing)
3. One mansion map, top-down 2D, ~10 named rooms
4. Real-time WASD movement, server-authoritative
5. Wall collision
6. Player name labels + colored sprites
7. Secret role assignment: Survivor, Corrupted, Vessel (private message, never in shared state)
8. 5 task types (timed mini-interactions in fixed locations)
9. 3 sabotage types (lights out, lock door, fake task call)
10. Emergency Meeting button (1 per player per match)
11. Discussion timer + voting (skip option, majority eject)
12. Ritual phase: Leader nominated, Second Witness chosen, group vote, three-card draw mechanic
13. Fear meter (rises in dark/alone/cursed/witnessing-death; visual distortion at high fear)
14. Kill action for Corrupted (range + cooldown)
15. Win conditions: Survivors complete tasks, Corrupted reach haunt parity, Vessel-as-Witness late = Corrupted win
16. Dev test mode: spawn bots, fast-forward timers, force role

## 4. Explicitly NOT in MVP

- 3D anything
- Voice chat / proximity audio
- Multiple maps
- Cosmetics, unlocks, accounts, leaderboards
- Mobile-optimized UI
- Anti-cheat beyond server validation
- Persistent matchmaking / ranked
- Optional roles (Medium, Priest, Skeptic, Occultist, Mimic) — design scaffolded only
- Replays, spectator mode beyond ghosts
- Localization

## 5. Game states (server `phase`)

| Phase | Entered when | Exited when |
|---|---|---|
| `lobby` | Room created | Host clicks Start with min players + all ready |
| `playing` | Match starts / meeting ends / ritual ends | Body reported, meeting button, ritual timer fires, win condition met |
| `meeting` | Body reported or button pressed | Discussion timer ends |
| `voting` | Meeting discussion ends | All voted or vote timer ends |
| `ritual` | Ritual timer fires from `playing` | Ritual resolution complete |
| `ended` | Win condition met | (terminal) |

State transitions are server-only.

## 6. UI screens

1. **Landing** — name input, create / join by code (✅)
2. **Lobby** — code, player list, ready toggle, start button (✅)
3. **Game HUD** — Phaser canvas + overlays: task list, fear meter, sabotage panel (Corrupted only), meeting button, role badge (private)
4. **Meeting** — circular player layout, discussion countdown
5. **Voting** — vote tiles per player + skip
6. **Ritual** — Leader's three-card draw view OR Witness/voter view depending on role in ritual
7. **End screen** — winner banner, role reveal, post-game stats

## 7. Backend events (Colyseus)

Server → Client (`client.send`):
- `role` `{ role, teammates }` — private, sent once on match start
- `error` `{ reason }`
- `hauntChange` `{ level, reason }`
- `ritualPrompt` `{ phase, options? }` — only to Leader/Witness/voters as relevant
- `kicked` `{ reason }`
- `pong` `{ t }` — for latency measurement

State sync (broadcast diff): `MatchState` with `phase`, `hauntLevel`, `players`, `tasks`, `sabotages`, `meeting?`, `ritual?`, `winner?`.

## 8. Client events (Colyseus messages)

Client → Server:
- `setName` `{ name }`
- `toggleReady`
- `startMatch`
- `move` `{ x, y, facing }`
- `interact` `{ entityId }` — task or sabotage object
- `kill` `{ targetId }`
- `report` `{ bodyId }`
- `callMeeting`
- `chat` `{ text }`
- `vote` `{ targetId | "skip" }`
- `nominateWitness` `{ playerId }` — Ritual Leader only
- `ritualChoice` `{ cardIndex }` — Ritual Leader/Witness only
- `ping` `{ t }`

## 9. Data structures (server schema)

```ts
MatchState {
  code: string
  phase: Phase
  hauntLevel: 0..3
  dayCount: number
  players: Map<id, Player>
  tasks: Map<id, Task>
  sabotages: Sabotage[]
  meeting?: Meeting
  ritual?: Ritual
  winner?: "survivors" | "corrupted"
}

Player {
  id, name, color
  isHost, ready, alive
  x, y, facing
  fear: 0..100
  // role NEVER stored in shared state — sent privately
  taskIds: string[]   // Survivor only, server-side
  killCooldown: number
}

Task { id, roomId, type, x, y, complete, assignedTo?, progress }
Sabotage { id, type, expiresAt, repairProgress }
Meeting { startedAt, calledBy, bodyId?, discussionEndsAt }
Vote { voterId, targetId | "skip" }
Ritual { phase: "nominate"|"witnessVote"|"draw"|"resolve",
         leaderId, witnessId?,
         cards: ("seal"|"awaken")[],
         leaderChoice?, witnessChoice? }
```

Per-connection (server-side only, never synced):
```ts
PrivatePlayer { role: "survivor"|"corrupted"|"vessel", knownTeammates: string[] }
```

## 10. Acceptance criteria for v0.1

A v0.1 build passes when:

- [ ] 4 testers in 4 browsers create + join via room code in <10s end-to-end
- [ ] All 4 see each other move in real time with <150ms perceived lag on localhost
- [ ] Walls block movement; no clipping through corners
- [ ] Match start assigns roles such that exactly one Vessel exists, ~25% are Corrupted (round to ≥1), rest Survivor
- [ ] Each Survivor has 3 tasks; completing all of one player's task list does not end the game (group goal)
- [ ] Corrupted can perform kill; body reportable; reporting enters meeting; vote ejects majority target
- [ ] Ritual fires every 4 minutes of `playing` time; Leader rotates; Witness voted in; result changes haunt level
- [ ] Vessel as Second Witness at haunt level 3 ends match with Corrupted win
- [ ] Survivor task completion or all Corrupted ejected ends match with Survivor win
- [ ] Fear meter rises/falls; at 80+ at least one perception effect (false footstep / distortion) fires
- [ ] Disconnect handling: rejoin within 60s restores player; permanent leave removes player and reassigns host
- [ ] Dev test mode can spawn 5 bots and force-set roles for solo testing
- [ ] No role information ever appears in `MatchState` broadcasts (verified by inspecting raw WS frames)
