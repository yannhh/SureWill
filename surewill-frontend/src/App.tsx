import React, { useState } from "react";
import "./App.css";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Authenticator } from "./components/Authenticator";
import Register from "./components/Register";
import VaultUpload from "./components/VaultUpload";
import BeneficiaryList from "./components/BeneficiaryList";
import { TOTPSetup } from "./components/TOTPSetup";
import VaultUnlock from "./components/VaultUnlock";
import HeirDashboard from "./components/HeirDashboard";

function AppContent() {
  const { userId, setUserId, isLoggedIn, logout } = useAuth();
  const [showRegister, setShowRegister] = useState(false);
  const [activeClaim, setActiveClaim] = useState<{
    id: string;
    shard: string;
  } | null>(null);

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
              <HeirDashboard
                onSelectAsset={(id, shard) => setActiveClaim({ id, shard })}
              />
            </section>

            {activeClaim && (
              <section>
                <VaultUnlock assetId={activeClaim.id} />
                <div
                  style={{
                    marginTop: "10px",
                    padding: "10px",
                    backgroundColor: "#f7fafc",
                    borderRadius: "5px",
                  }}
                >
                  <p style={{ fontSize: "11px", color: "#2d3748" }}>
                    <strong>Your Shard A:</strong> <br />
                    <code style={{ wordBreak: "break-all" }}>
                      {activeClaim.shard}
                    </code>
                  </p>
                  <p
                    style={{
                      fontSize: "10px",
                      color: "#718096",
                      fontStyle: "italic",
                    }}
                  >
                    (Copy this, then paste it alongside a shard from the vault
                    into the box above)
                  </p>
                </div>
              </section>
            )}
          </main>
        </div>
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
