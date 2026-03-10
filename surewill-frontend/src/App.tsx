import React, { useState } from "react";
import "./App.css";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Auth } from "./components/Auth";
import { Dashboard } from "./components/Dashboard";
import { PublicHeirPortal } from "./components/PublicHeirPortal";

function AppContent() {
  const { userId, setUserId, isLoggedIn, logout } = useAuth();

  // This controls whether the unauthenticated user is looking at the Login page or the Heir Claim page
  const [view, setView] = useState<"landing" | "heir">("landing");

  return (
    <div className="App">
      {!isLoggedIn ? (
        view === "landing" ? (
          <Auth setUserId={setUserId} onSwitchToHeir={() => setView("heir")} />
        ) : (
          <PublicHeirPortal onBack={() => setView("landing")} />
        )
      ) : (
        <Dashboard userId={userId!} logout={logout} />
      )}
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
