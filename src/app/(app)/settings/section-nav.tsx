"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const OFFSET = 136; // sticky top bar (64px) + this bar + a little room

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const isPhone = () => window.matchMedia("(max-width: 639px)").matches;

type Group = { id: string; title: string; content: ReactNode; phoneOnlyTab?: boolean };

/**
 * The group bar on Settings, with the groups under it. On a computer every
 * group is shown: the bar stays under the top bar, glides to a group when
 * clicked, flashes the group it lands on, and marks the group in view.
 * On a phone only the chosen group is shown, like tabs.
 */
export function SectionNav({ groups }: { groups: Group[] }) {
  const [active, setActive] = useState(groups[0]?.id);
  const gliding = useRef(false);
  const bar = useRef<HTMLElement>(null);

  // Phones show the groups in one sliding row: keep the active one in sight.
  useEffect(() => {
    const nav = bar.current;
    const chip = nav?.querySelector<HTMLElement>(`[href="#${active}"]`);
    if (!nav || !chip || nav.scrollWidth <= nav.clientWidth) return;
    nav.scrollTo({ left: chip.offsetLeft - (nav.clientWidth - chip.offsetWidth) / 2, behavior: "smooth" });
  }, [active]);

  // A link to /settings#clients opens that group on a phone.
  useEffect(() => {
    const fromLink = () => {
      const id = location.hash.slice(1);
      if (isPhone() && groups.some((g) => g.id === id)) setActive(id);
    };
    fromLink();
  }, [groups]);

  // Mark the group currently in view while the page scrolls.
  useEffect(() => {
    const onScroll = () => {
      if (gliding.current || isPhone()) return;
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
    if (isPhone()) {
      // Phone: switch to that group and show it from its top.
      const top = (bar.current?.parentElement?.getBoundingClientRect().top ?? 0) + window.scrollY - 64;
      if (window.scrollY > top) window.scrollTo(0, Math.max(0, top));
      return;
    }
    const from = window.scrollY;
    const to = Math.min(el.getBoundingClientRect().top + window.scrollY - OFFSET, document.documentElement.scrollHeight - window.innerHeight);
    // The gold glow runs as its own animation. It must not touch the class:
    // React resets the class while you scroll, and that would replay the
    // page's fade-in, so the group vanished and came back.
    const flash = () =>
      el.animate(
        [
          { boxShadow: "0 0 0 0 rgb(214 178 90 / 0)" },
          { boxShadow: "0 0 0 4px rgb(214 178 90 / 0.55), 0 12px 32px -12px rgb(214 178 90 / 0.5)", offset: 0.25 },
          { boxShadow: "0 0 0 0 rgb(214 178 90 / 0)" },
        ],
        { duration: 1300, easing: "ease-out", composite: "add" },
      );
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || Math.abs(to - from) < 2) {
      window.scrollTo(0, to);
      flash();
      return;
    }
    const ms = Math.min(900, 350 + Math.abs(to - from) * 0.35);
    let start: number | null = null;
    gliding.current = true;
    // If you scroll yourself while it glides, stop gliding at once so the page
    // never fights your scrolling (that made the groups jump and flicker).
    let stopped = false;
    const inputs = ["wheel", "touchstart", "keydown", "mousedown"] as const;
    const stop = () => {
      stopped = true;
      gliding.current = false;
      inputs.forEach((e) => window.removeEventListener(e, stop));
    };
    inputs.forEach((e) => window.addEventListener(e, stop, { passive: true }));
    const step = (now: number) => {
      if (stopped) return;
      start ??= now;
      const t = Math.min(1, (now - start) / ms);
      window.scrollTo(0, from + (to - from) * ease(t));
      if (t < 1) requestAnimationFrame(step);
      else {
        stop();
        flash();
      }
    };
    requestAnimationFrame(step);
  }

  return (
    <>
    <nav
      ref={bar}
      aria-label="Setting groups"
      className="sticky top-16 z-10 -mx-1 flex flex-wrap gap-2 rounded-xl bg-slate-50/85 px-1 py-2 backdrop-blur-md max-sm:-mx-4 max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:rounded-none max-sm:px-4 max-sm:[scrollbar-width:none]"
    >
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
            className={`rounded-full px-3 py-2 text-sm sm:py-1 font-medium max-sm:shrink-0 max-sm:whitespace-nowrap shadow-sm ring-1 transition-all duration-300 ${
              on ? "bg-navy-800 text-white ring-navy-800" : "bg-white text-slate-700 ring-slate-200 hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow"
            }`}
          >
            {g.title}
          </a>
        );
      })}
    </nav>
    {groups.map((g) => (
      <section
        key={g.id}
        id={g.id}
        className={`scroll-mt-36 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ${g.id === active ? "" : "max-sm:hidden"}`}
      >
        <h2 className="border-b border-slate-100 bg-slate-50 px-5 py-3 text-sm font-semibold text-slate-900 max-sm:px-4">{g.title}</h2>
        {g.content}
      </section>
    ))}
    </>
  );
}
