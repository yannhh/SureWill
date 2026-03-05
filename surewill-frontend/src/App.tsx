import React, { useState } from "react";
import "./App.css";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Authenticator } from "./components/Authenticator";
import Register from "./components/Register";
import VaultUpload from "./components/VaultUpload";
import BeneficiaryList from "./components/BeneficiaryList";
import { TOTPSetup } from "./components/TOTPSetup";
import VaultUnlock from "./components/VaultUnlock";

function AppContent() {
  const { userId, setUserId, isLoggedIn, logout } = useAuth();
  const [showRegister, setShowRegister] = useState(false);

  return (
    <div className="App">
      {!isLoggedIn ? (
        <div className="auth-view">
          {showRegister ? (
            <Register />
          ) : (
            <Authenticator setUserId={setUserId} />
          )}
          <div style={{ marginTop: "20px", textAlign: "center" }}>
            <button
              className="toggle-btn"
              onClick={() => setShowRegister(!showRegister)}
            >
              {showRegister
                ? "Already have a vault? Login"
                : "New User? Create a Vault"}
            </button>
          </div>
        </div>
      ) : (
        <div className="dashboard-view">
          <header className="vault-header">
            <h1>SureWill Secure Vault</h1>
            <button onClick={logout} className="logout-btn">
              Lock Vault
            </button>
          </header>

          <main className="dashboard-grid">
            <section>
              <TOTPSetup userId={userId!} />
            </section>

            <section>
              <VaultUpload userId={userId!} />
            </section>

            <section>
              <BeneficiaryList userId={userId!} />
            </section>

            <section>
              <VaultUnlock assetId="69a8452aca522513127d46c5" /> //this is
              hardcoded because the app does not yet have a state management
              system to tell VaultUnlock which file it should be looking at
              coded
            </section>
          </main>
        </div>
      )}
    </div>
  );
}

// Ensure the Provider wraps the content so useAuth works!
function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
