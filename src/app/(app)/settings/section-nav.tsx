"use client";

import { useEffect, useRef, useState } from "react";

const OFFSET = 136; // sticky top bar (64px) + this bar + a little room

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * The group bar on Settings. It stays under the top bar, glides to a group
 * when clicked, flashes the group it lands on, and marks the group in view.
 */
export function SectionNav({ groups }: { groups: { id: string; title: string }[] }) {
  const [active, setActive] = useState(groups[0]?.id);
  const gliding = useRef(false);

  // Mark the group currently in view while the page scrolls.
  useEffect(() => {
    const onScroll = () => {
      if (gliding.current) return;
      let current = groups[0]?.id;
      for (const g of groups) {
        const el = document.getElementById(g.id);
        if (el && el.getBoundingClientRect().top <= OFFSET + 8) current = g.id;
      }
      // At the very bottom, the last group is the one in view.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) current = groups.at(-1)?.id ?? current;
      setActive(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [groups]);

  function go(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    setActive(id);
    history.replaceState(null, "", `#${id}`);
    const from = window.scrollY;
    const to = Math.min(el.getBoundingClientRect().top + window.scrollY - OFFSET, document.documentElement.scrollHeight - window.innerHeight);
    const flash = () => {
      el.classList.remove("section-flash");
      void el.offsetWidth; // restart the animation if clicked twice
      el.classList.add("section-flash");
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || Math.abs(to - from) < 2) {
      window.scrollTo(0, to);
      flash();
      return;
    }
    const ms = Math.min(900, 350 + Math.abs(to - from) * 0.35);
    let start: number | null = null;
    gliding.current = true;
    const step = (now: number) => {
      start ??= now;
      const t = Math.min(1, (now - start) / ms);
      window.scrollTo(0, from + (to - from) * ease(t));
      if (t < 1) requestAnimationFrame(step);
      else {
        gliding.current = false;
        flash();
      }
    };
    requestAnimationFrame(step);
  }

  return (
    <nav aria-label="Setting groups" className="sticky top-16 z-10 -mx-1 flex flex-wrap gap-2 rounded-xl bg-slate-50/85 px-1 py-2 backdrop-blur-md">
      {groups.map((g) => {
        const on = g.id === active;
        return (
          <a
            key={g.id}
            href={`#${g.id}`}
            aria-current={on ? "true" : undefined}
            onClick={(e) => {
              e.preventDefault();
              go(g.id);
            }}
            className={`rounded-full px-3 py-1 text-sm font-medium shadow-sm ring-1 transition-all duration-300 ${
              on ? "bg-navy-800 text-white ring-navy-800" : "bg-white text-slate-700 ring-slate-200 hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow"
            }`}
          >
            {g.title}
          </a>
        );
      })}
    </nav>
  );
}
