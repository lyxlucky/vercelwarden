"use client";

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return Promise.resolve(null);
  registrationPromise ??= navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" })
    .then((registration) => {
      window.setInterval(() => void registration.update(), 60 * 60 * 1000);
      return registration;
    })
    .catch(() => null);
  return registrationPromise;
}
