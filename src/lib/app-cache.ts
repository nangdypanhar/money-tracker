import { deleteDb } from "@/lib/db/idb";
import { DB_NAMES } from "@/lib/db/mode";

/**
 * Clears cached app files (service worker + Cache Storage) and force-reloads. Never touches IndexedDB,
 * so the user's data stays. Mirrors public/reset.html, which does the same for a phone stuck on an old version.
 */
export async function clearAppCacheAndReload(): Promise<void> {
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((r) => r.unregister()));
  }
  // Cache Storage only exists in secure contexts (HTTPS / localhost).
  if (typeof caches !== "undefined") {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
  // A unique query string makes the browser fetch a fresh page instead of reusing its copy.
  window.location.replace(`/?refreshed=${Date.now()}`);
}

/**
 * Factory reset: deletes BOTH databases (real + demo), the PIN and every MoneyTrack setting in browser storage,
 * the service worker and its caches — then opens the app as a fresh install. Cannot be undone.
 */
export async function resetEverything(): Promise<void> {
  for (const name of Object.values(DB_NAMES)) await deleteDb(name);

  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith("moneytrack:")) localStorage.removeItem(key);
    sessionStorage.clear();
  } catch {
    // Storage blocked: nothing stored there to clear.
  }
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((r) => r.unregister()));
  }
  if (typeof caches !== "undefined") {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
  window.location.replace(`/?reset=${Date.now()}`);
}
