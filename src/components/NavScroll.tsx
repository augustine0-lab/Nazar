"use client";

import { useEffect } from "react";

/** On a phone the sections are one row that scrolls sideways: bring the open section into view. */
export function NavScroll() {
  useEffect(() => {
    const nav = document.querySelector<HTMLElement>(".topnav");
    const current = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !current || nav.scrollWidth <= nav.clientWidth) return;
    nav.scrollLeft = current.offsetLeft - (nav.clientWidth - current.offsetWidth) / 2;
  }, []);
  return null;
}
