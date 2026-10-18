"use client";

import { useEffect, useState } from "react";

/** Shows the last action's success message for a few seconds, then clears its cookie. */
export function Flash({ value }: { value: string | null }) {
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    if (!value) return;
    document.cookie = "nazar_flash=; Max-Age=0; path=/";
    setShown(value.slice(value.indexOf("|") + 1));
    const t = setTimeout(() => setShown(null), 4000);
    return () => clearTimeout(t);
  }, [value]);
  return (
    <div className="toast" role="status" aria-live="polite" data-shown={shown ? "true" : "false"}>
      {shown}
    </div>
  );
}
