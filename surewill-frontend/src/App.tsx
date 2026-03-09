import React, { useState, useEffect } from "react";
import "./App.css";
import { AuthProvider, useAuth } from "./context/AuthContext";
import VaultUpload from "./components/VaultUpload";
import BeneficiaryList from "./components/BeneficiaryList";
import VaultUnlock from "./components/VaultUnlock";
import HeirDashboard from "./components/HeirDashboard";
import { Auth } from "./components/Auth";

function AppContent() {
  const { userId, setUserId, isLoggedIn, logout } = useAuth();
  const [activeClaim, setActiveClaim] = useState<{
    id: string;
    shard: string;
  } | null>(null);
  const [heirCount, setHeirCount] = useState(0);
  const [assetRefresh, setAssetRefresh] = useState(0);

  // Refreshing the count of heir from server
  const refreshHeirCount = async () => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/beneficiaries/${userId}`);
      const data = await res.json();
      setHeirCount(data.length || 0);
    } catch (err) {
      console.error("Failed to sync beneficiary count.");
    }
  };

  useEffect(() => {
    if (isLoggedIn) refreshHeirCount();
  }, [isLoggedIn, userId]);

  return (
    <div className="App">
      {!isLoggedIn ? (
        <div>
          <Auth setUserId={setUserId} />
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
              <VaultUpload
                userId={userId!}
                heirCount={heirCount}
                onAssetUploaded={() => setAssetRefresh((prev) => prev + 1)}
              />
            </section>

            <section>
              <BeneficiaryList
                userId={userId!}
                onBeneficiaryAdded={refreshHeirCount}
                assetRefresh={assetRefresh}
              />
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
