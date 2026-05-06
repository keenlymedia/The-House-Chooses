# The House Chooses

A browser multiplayer horror social deduction game. 6–12 players are trapped in a haunted mansion: most are Survivors completing rituals to seal the house, a few are Corrupted sabotaging from within, and one may be the hidden Vessel.

> Among Us movement + Secret Hitler politics + Phasmophobia dread.

## Status

**Step 1 of 12: Lobby + room codes.** This is an early MVP scaffold, not a playable game yet.

## Stack

- **Client:** React + Phaser 3 + TypeScript + Vite
- **Server:** Node.js + Colyseus (authoritative rooms)
- **Shared:** TypeScript types/constants used by both
- **Persistence (later):** Supabase

## Repo layout

```
packages/
  shared/   # types, constants, message names
  server/   # Colyseus server, rooms, game systems
  client/   # React UI + Phaser game
```

## Running locally

```bash
npm install
npm run dev          # runs server (2567) + client (5173) in parallel
```

Then open http://localhost:5173, create a room, share the 4-letter code, and have other tabs join.

## Build order

1. **Lobby + room codes** ← current
2. Player movement sync
3. Mansion map (tilemap + collisions)
4. Role assignment (Survivor / Corrupted / Vessel)
5. Task system
6. Sabotage system
7. Meeting + voting
8. Ritual Leader / Second Witness
9. Fear meter + perception effects
10. Kill action
11. Win conditions
12. Dev test mode (bots, fast-forward)
