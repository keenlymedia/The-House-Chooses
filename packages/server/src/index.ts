import http from "http";
import express from "express";
import cors from "cors";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { monitor } from "@colyseus/monitor";
import { ROOM_NAME } from "@house/shared";
import { MansionRoom } from "./rooms/MansionRoom.js";
import { roomCodes } from "./rooms/roomCodes.js";

const PORT = Number(process.env.PORT ?? 2567);

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, rooms: roomCodes.size });
});

// Resolve a 4-letter room code → Colyseus roomId so the client can join by code.
app.get("/code/:code", (req, res) => {
  const code = req.params.code.toUpperCase();
  const roomId = roomCodes.get(code);
  if (!roomId) {
    res.status(404).json({ error: "room_not_found" });
    return;
  }
  res.json({ roomId, code });
});

app.use("/colyseus", monitor());

const httpServer = http.createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define(ROOM_NAME, MansionRoom);

gameServer.listen(PORT).then(() => {
  console.log(`[house] listening on :${PORT}`);
});
