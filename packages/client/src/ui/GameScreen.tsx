import { useEffect, useRef } from "react";
import type { Room } from "colyseus.js";
import { mountGame, type GameHandle } from "../game/mountGame.js";

interface Props {
  room: Room;
}

export function GameScreen({ room }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<GameHandle | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    handleRef.current = mountGame(containerRef.current, room);
    return () => {
      handleRef.current?.destroy();
      handleRef.current = null;
    };
  }, [room]);

  return (
    <div className="game-shell">
      <div
        ref={containerRef}
        style={{ width: 960, height: 540, background: "#0a0910" }}
      />
    </div>
  );
}
