import { useEffect, useState } from "react";

const NARROW_BREAKPOINT_PX = 900;

export function MobileWarning() {
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.innerWidth < NARROW_BREAKPOINT_PX,
  );
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    function onResize() {
      setNarrow(window.innerWidth < NARROW_BREAKPOINT_PX);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  if (!narrow || dismissed) return null;

  return (
    <div className="mobile-warning">
      <div className="mobile-warning-card">
        <div className="mobile-warning-eyebrow">Desktop recommended</div>
        <p>
          The House Chooses is built for keyboard + mouse. WASD movement and
          held-key interactions don't translate well to touch yet. Continue at
          your own peril.
        </p>
        <button onClick={() => setDismissed(true)}>I understand</button>
      </div>
    </div>
  );
}
