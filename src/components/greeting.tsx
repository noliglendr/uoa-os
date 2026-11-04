"use client";

import { useSyncExternalStore } from "react";

function greetingNow(): string {
  const hour = new Date().getHours(); // the reader's own clock
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

const noSubscription = () => () => {};

/**
 * "Good morning / afternoon / evening" by the reader's own clock. The server
 * doesn't know the reader's time zone, so it renders "Welcome" and the browser
 * swaps in the right greeting as soon as the page loads.
 */
export function Greeting({ name }: { name: string }) {
  const greeting = useSyncExternalStore(noSubscription, greetingNow, () => "Welcome");
  return (
    <>
      {greeting}, {name}
    </>
  );
}
