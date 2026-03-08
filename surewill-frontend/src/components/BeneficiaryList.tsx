import React, { useState, useEffect } from "react";

const BeneficiaryList: React.FC<{
  userId: string;
  onBeneficiaryAdded: () => void;
  assetRefresh: number;
}> = ({ userId, onBeneficiaryAdded, assetRefresh }) => {
  // State for fetching data for dropdowns
  const [assets, setAssets] = useState<any[]>([]);
  const [beneficiaries, setBeneficiaries] = useState<any[]>([]);

  // State for selections
  const [selectedAsset, setSelectedAsset] = useState("");
  const [selectedBeneficiary, setSelectedBeneficiary] = useState("");
  const [status, setStatus] = useState("");

  // Form state for adding a new beneficiary
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [relationship, setRelationship] = useState("");

  // Load dropdown data when the component loads
  useEffect(() => {
    fetchData();
  }, [userId, assetRefresh]);

  const fetchData = async () => {
    try {
      const [assetRes, benRes] = await Promise.all([
        fetch(`/api/vault/list/${userId}`),
        fetch(`/api/beneficiaries/${userId}`),
      ]);
      setAssets(await assetRes.json());
      setBeneficiaries(await benRes.json());
    } catch (err) {
      console.error("Failed to load data for dropdowns");
    }
  };

  const addBeneficiary = async () => {
    setStatus("Registering...");
    const res = await fetch("/api/beneficiaries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, fullName: name, email, relationship }),
    });
    const data = await res.json();
    if (res.ok) {
      setStatus("Beneficiary Added to Vault Trust!");
      fetchData(); // Refresh the dropdown so the new person appears
      onBeneficiaryAdded();
    } else {
      setStatus(data.error);
    }
  };

  const handleAssignAsset = async () => {
    if (!selectedAsset || !selectedBeneficiary) {
      return setStatus("Please select both an asset and a beneficiary.");
    }

    setStatus("Assigning cryptographic shard...");
    // This calls your existing backend endpoint!
    const res = await fetch("/api/vault/access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assetId: selectedAsset,
        beneficiaryId: selectedBeneficiary,
      }),
    });
    const data = await res.json();
    setStatus(data.message || data.error);
    fetchData(); // Refresh data to update shard counts
  };

  return (
    <div className="vault-container">
      <h3 className="vault-header">Trust & Asset Distribution</h3>

      {/* SECTION 1: ADD BENEFICIARY */}
      <div
        className="input-group"
        style={{
          marginBottom: "20px",
          borderBottom: "1px solid #ddd",
          paddingBottom: "15px",
        }}
      >
        <h4>1. Register New Heir</h4>
        <input
          type="text"
          placeholder="Full Name"
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="email"
          placeholder="Email"
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="text"
          placeholder="Relationship"
          onChange={(e) => setRelationship(e.target.value)}
        />
        <button onClick={addBeneficiary} style={{ backgroundColor: "#2f855a" }}>
          Register Beneficiary
        </button>
      </div>

      {/* SECTION 2: ASSIGN ASSET */}
      <div className="input-group">
        <h4>2. Distribute Asset to Heir</h4>
        <select
          onChange={(e) => setSelectedAsset(e.target.value)}
          value={selectedAsset}
        >
          <option value="">-- Select an Asset to Distribute --</option>
          {assets.map((a) => (
            <option key={a._id} value={a._id}>
              {a.file_name} (Requires {a.threshold} shards to unlock)
            </option>
          ))}
        </select>

        <select
          onChange={(e) => setSelectedBeneficiary(e.target.value)}
          value={selectedBeneficiary}
        >
          <option value="">-- Select a Beneficiary --</option>
          {beneficiaries.map((b) => (
            <option key={b._id} value={b._id}>
              {b.full_name} ({b.email})
            </option>
          ))}
        </select>

        <button
          onClick={handleAssignAsset}
          style={{ backgroundColor: "#4a5568" }}
        >
          Assign Shard to Beneficiary
        </button>
      </div>

      {status && <p className="status-msg">{status}</p>}
    </div>
  );
};

export default BeneficiaryList;
