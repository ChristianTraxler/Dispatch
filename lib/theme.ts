/**
 * Theme mode is a per-device preference held in localStorage — it is
 * deliberately not an account setting, so someone can run dark on a laptop at
 * night and light on their phone.
 *
 * "system" stores no `data-theme` attribute at all and lets the
 * prefers-color-scheme block in globals.css decide, which is what makes the
 * OS switch take effect live with no listener of our own.
 */
export type ThemeMode = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "dispatch-theme";

/** Cycle order for the toggle: System → Light → Dark → System. */
export const THEME_CYCLE: readonly ThemeMode[] = ["system", "light", "dark"];

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "system" || value === "light" || value === "dark";
}

export function nextThemeMode(mode: ThemeMode): ThemeMode {
  const i = THEME_CYCLE.indexOf(mode);
  return THEME_CYCLE[(i + 1) % THEME_CYCLE.length];
}

/** Reads the stored mode. Storage can throw in private browsing, so it falls
 *  back to following the system rather than failing the render. */
export function readThemeMode(): ThemeMode {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(raw) ? raw : "system";
  } catch {
    return "system";
  }
}

export function storeThemeMode(mode: ThemeMode): void {
  try {
    if (mode === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Preference just will not persist; the current page still themes fine.
  }
}

export function applyThemeMode(mode: ThemeMode): void {
  const root = document.documentElement;
  if (mode === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", mode);
}

/* --------------------------------------------------------------------------
   The stored mode is an external store, so components read it through
   useSyncExternalStore rather than copying it into state inside an effect.
   -------------------------------------------------------------------------- */

const listeners = new Set<() => void>();

export function subscribeThemeMode(onChange: () => void): () => void {
  listeners.add(onChange);

  // Re-assert on mount. Anything that recreates <html> after the init script
  // ran — a React hydration recovery, for instance — drops the attribute
  // without touching localStorage, and this puts it back.
  applyThemeMode(readThemeMode());

  // `storage` only fires in *other* tabs, so this is what keeps a second tab
  // in step — it has to re-apply the attribute itself, not just re-render.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== THEME_STORAGE_KEY) return;
    applyThemeMode(readThemeMode());
    onChange();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** The single entry point for a theme change: apply, persist, notify. */
export function setThemeMode(mode: ThemeMode): void {
  applyThemeMode(mode);
  storeThemeMode(mode);
  for (const listener of listeners) listener();
}

/** The server cannot know the stored preference, so it always renders System. */
export function getServerThemeMode(): ThemeMode {
  return "system";
}

/**
 * Runs before first paint to stop a light flash on a dark-themed load.
 *
 * Inlined as a raw string rather than imported, because it has to execute
 * during HTML parsing — before React, and before the body renders. Keep it
 * small, dependency-free, and total: a throw here would block the page.
 *
 * "system" needs no work, since the absence of the attribute is what hands
 * control to the media query.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var m=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(m==="light"||m==="dark"){document.documentElement.setAttribute("data-theme",m)}}catch(e){}})()`;

export const THEME_LABEL: Record<ThemeMode, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};
