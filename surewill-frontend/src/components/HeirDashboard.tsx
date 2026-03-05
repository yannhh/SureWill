import React, { useState } from "react";

const HeirDashboard = ({
  onSelectAsset,
}: {
  onSelectAsset: (id: string, shard: string) => void;
}) => {
  const [email, setEmail] = useState("");
  const [claims, setClaims] = useState<any[]>([]);
  const [error, setError] = useState("");

  const checkClaims = async () => {
    setError("");
    try {
      const res = await fetch(`/api/beneficiary/claims/${email}`);
      const data = await res.json();

      if (res.ok) {
        setClaims(data.claims || []);
      } else {
        setError(data.error);
        setClaims([]);
      }
    } catch (err) {
      setError("Failed to reach server.");
    }
  };

  return (
    <div className="vault-container">
      <h2 className="vault-header">Heir Claim Portal</h2>
      <div className="input-group">
        <input
          type="email"
          placeholder="Registered Heir Email"
          onChange={(e) => setEmail(e.target.value)}
        />
        <button onClick={checkClaims}>Check for Released Assets</button>
      </div>

      {error && (
        <p className="status-msg" style={{ color: "#e53e3e" }}>
          {error}
        </p>
      )}

      <div className="claims-list" style={{ marginTop: "20px" }}>
        {claims.length > 0
          ? claims.map((claim) => (
              <div
                key={claim.assetId}
                className="claim-card"
                style={{
                  padding: "10px",
                  border: "1px solid #ddd",
                  marginBottom: "10px",
                }}
              >
                <p style={{ fontSize: "12px" }}>
                  <strong>Asset ID:</strong> {claim.assetId}
                </p>
                <button
                  onClick={() => onSelectAsset(claim.assetId, claim.shard)}
                  style={{
                    backgroundColor: "#4a5568",
                    fontSize: "12px",
                    padding: "5px 10px",
                  }}
                >
                  Prepare for Unlocking
                </button>
              </div>
            ))
          : /* NEW: The fallback message so the UI isn't silently blank */
            !error &&
            email && (
              <p style={{ fontSize: "14px", color: "#718096" }}>
                No assigned assets found. The vault may still be locked, or no
                assets have been assigned to this email.
              </p>
            )}
      </div>
    </div>
  );
};

export default HeirDashboard;
