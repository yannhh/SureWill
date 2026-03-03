import React, { useState } from "react";

const BeneficiaryList: React.FC<{ userId: string }> = ({ userId }) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [relationship, setRelationship] = useState("");

  const addBeneficiary = async () => {
    const res = await fetch("/api/beneficiaries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, fullName: name, email, relationship }),
    });
    const data = await res.json();
    if (res.ok) alert("Beneficiary Added to Vault Trust");
  };

  return (
    <div className="vault-container">
      <h3 className="vault-header">Assign Beneficiaries</h3>
      <div className="input-group">
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
    </div>
  );
};

export default BeneficiaryList;
