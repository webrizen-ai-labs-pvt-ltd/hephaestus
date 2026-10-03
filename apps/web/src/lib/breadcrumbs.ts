import { useEffect, useSyncExternalStore } from "react";

/*
 * Breadcrumbs come from the URL and the sidebar structure. Detail pages
 * (a person, a project, an invoice) add their own name as the last crumb.
 */

let detail: string | null = null;
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};

/** Name the current detail page in the breadcrumb ("Website Relaunch", "INV/26-27/0004"). */
export function useCrumb(label: string | null | undefined) {
  useEffect(() => {
    if (!label) return;
    detail = label;
    emit();
    return () => {
      if (detail === label) {
        detail = null;
        emit();
      }
    };
  }, [label]);
}

export function useDetailCrumb() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => detail,
  );
}
