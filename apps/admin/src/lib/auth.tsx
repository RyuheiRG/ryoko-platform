import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  getSession,
  login as apiLogin,
  logout as apiLogout,
  type StoredSession,
  subscribeSession,
} from "./api";

interface AuthContextValue {
  session: StoredSession | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StoredSession | null>(() => getSession());

  useEffect(() => {
    const unsubscribe = subscribeSession(setSession);
    const onStorage = (event: StorageEvent) => {
      if (event.key === "ryoko.cms.session") {
        setSession(getSession());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      unsubscribe();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      signIn: async (email, password) => {
        await apiLogin(email, password);
      },
      signOut: async () => {
        await apiLogout();
      },
    }),
    [session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
