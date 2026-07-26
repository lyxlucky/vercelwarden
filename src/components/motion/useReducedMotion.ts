"use client";

import { useSyncExternalStore } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function reducedMotionSnapshot() {
  if (typeof document !== "undefined" && document.documentElement.dataset.vwMotion === "reduced") return true;
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(REDUCED_MOTION_QUERY).matches
    : false;
}

function subscribeReducedMotion(notify: () => void) {
  if (typeof window === "undefined" || typeof document === "undefined") return () => undefined;
  const mediaQuery = typeof window.matchMedia === "function" ? window.matchMedia(REDUCED_MOTION_QUERY) : null;
  mediaQuery?.addEventListener("change", notify);
  const observer = new MutationObserver(notify);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-vw-motion"] });
  return () => {
    mediaQuery?.removeEventListener("change", notify);
    observer.disconnect();
  };
}

export function useReducedMotion() {
  return useSyncExternalStore(subscribeReducedMotion, reducedMotionSnapshot, () => true);
}

export function motionTimeout<T>(reducedMotion: boolean, timeout: T): T | 0 {
  return reducedMotion ? 0 : timeout;
}

