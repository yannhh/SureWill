import React from "react";
import "./App.css";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Auth } from "./components/Auth";
import { Dashboard } from "./components/Dashboard";

function AppContent() {
  const { userId, setUserId, isLoggedIn, logout } = useAuth();

  return (
    <div className="App">
      {!isLoggedIn ? (
        <Auth setUserId={setUserId} />
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
