import { createContext, ReactNode, useContext, useState } from "react";
import { User } from "../types";
import * as auth from "../services/authService";

interface AuthContextValue {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => auth.storedUser());

  async function doLogin(email: string, password: string) { setUser(await auth.login(email, password)); }
  function doLogout() { auth.logout(); setUser(null); }

  return <AuthContext.Provider value={{ user, login: doLogin, logout: doLogout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de AuthProvider");
  return ctx;
}