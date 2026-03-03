import React, { createContext, useContext, useState, ReactNode } from "react";

interface AuthContextType {
  userId: string | null;
  setUserId: (id: string | null) => void;
  isLoggedIn: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [userId, setUserId] = useState<string | null>(null);

  const logout = () => setUserId(null);

  return (
    <AuthContext.Provider
      value={{ userId, setUserId, isLoggedIn: !!userId, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};
