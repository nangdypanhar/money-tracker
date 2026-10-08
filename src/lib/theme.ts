/** Shared by the server layout (pre-paint script, viewport meta) and the client theme provider. */
export const THEME_STORAGE_KEY = "moneytrack:theme";

/** Id of the app's own theme-color tag (always first in <head>, so it's the one browsers use). */
export const STATUS_BAR_META_ID = "mt-status-bar";

/** Phone status bar colors — must equal --status-bar in globals.css. */
export const STATUS_BAR = { light: "#d4def3", dark: "#182a52" } as const;
