/**
 * Real vs. demo data. Each mode has its own IndexedDB database, so demo records can never mix with
 * the user's real records. The current mode is a UI preference kept in localStorage.
 */

export type DataMode = "real" | "demo";

const MODE_KEY = "moneytrack:mode";

export const DB_NAMES: Record<DataMode, string> = {
  real: "moneytrack",
  demo: "moneytrack-demo",
};

export function getDataMode(): DataMode {
  try {
    return localStorage.getItem(MODE_KEY) === "demo" ? "demo" : "real";
  } catch {
    return "real";
  }
}

/** Switch and restart the app so every provider (data, PIN lock) re-initializes against the other database. */
export function switchDataMode(mode: DataMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Storage blocked: stay in the current mode.
    return;
  }
  restartApp();
}

/**
 * Full reload to the home screen. Intentional instead of router.push: after switching or wiping a
 * database, every provider (data, PIN lock) must start over against the new state.
 */
export function restartApp(): void {
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full restart is required
  window.location.assign("/");
}
