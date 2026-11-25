import { useCallback, useEffect, useRef, useState } from "react";

const PREFIX = "ryoko.cms.draft.";

export interface LocalDraft {
  savedAt: string;
  json: string;
}

function storageKey(key: string): string {
  return `${PREFIX}${key}`;
}

export function readLocalDraft(key: string): LocalDraft | null {
  try {
    const raw = window.localStorage.getItem(storageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalDraft>;
    if (typeof parsed.savedAt !== "string" || typeof parsed.json !== "string") {
      return null;
    }
    return { savedAt: parsed.savedAt, json: parsed.json };
  } catch {
    return null;
  }
}

export function clearLocalDraft(key: string): void {
  try {
    window.localStorage.removeItem(storageKey(key));
  } catch {
    // Storage can be unavailable (private mode); there is nothing to clear.
  }
}

export function useLocalDraft<T>(key: string, value: T, enabled: boolean) {
  const serialized = JSON.stringify(value);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const [draft, setDraft] = useState<LocalDraft | null>(() => readLocalDraft(key));

  useEffect(() => {
    setDraft(readLocalDraft(key));
  }, [key]);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => {
      if (!enabledRef.current) return;
      try {
        window.localStorage.setItem(
          storageKey(key),
          JSON.stringify({ savedAt: new Date().toISOString(), json: serialized }),
        );
      } catch {
        // Ignore quota or availability errors; the server save still works.
      }
    }, 600);
    return () => window.clearTimeout(timer);
  }, [key, serialized, enabled]);

  const clear = useCallback(() => {
    clearLocalDraft(key);
    setDraft(null);
  }, [key]);

  const restore = useCallback((): T | null => {
    if (!draft) return null;
    try {
      const parsed = JSON.parse(draft.json) as unknown;
      if (typeof parsed !== "object" || parsed === null) return null;
      return parsed as T;
    } catch {
      return null;
    }
  }, [draft]);

  return { draft, clear, restore };
}
