import { useSyncExternalStore } from "react";

export type ThemePref = "system" | "light" | "dark";
const KEY = "heph-theme";
const listeners = new Set<() => void>();

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

let current: ThemePref = read();
const mq = window.matchMedia("(prefers-color-scheme: dark)");

function apply() {
  const dark = current === "dark" || (current === "system" && mq.matches);
  document.documentElement.classList.toggle("dark-mode", dark);
}

mq.addEventListener("change", () => current === "system" && apply());
// Apply the saved choice on load (index.html starts dark to avoid a flash for the default).
apply();

export function setTheme(pref: ThemePref) {
  current = pref;
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    // Storage unavailable (private mode): the choice lasts for this tab only.
  }
  apply();
  for (const l of listeners) l();
}

export function useTheme() {
  const pref = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
  return [pref, setTheme] as const;
}
