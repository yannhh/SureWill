import React, { useState } from "react";

const VaultUpload: React.FC<{ userId: string }> = ({ userId }) => {
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState("");

  const handleUpload = async () => {
    // Note: Final version will use libsodium here
    const res = await fetch("/api/vault/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        encryptedData: "SIMULATED_ENCRYPTED_BLOB", //
        nonce: "mock_nonce_123",
        fileName: fileName,
        fileType: "application/pdf",
        fileSize: 1024,
      }),
    });
    const data = await res.json();
    setStatus(data.message || "Upload failed");
  };

  return (
    <div className="vault-container">
      <h3 className="vault-header">Secure Asset Upload</h3>
      <div className="input-group">
        <input
          type="text"
          placeholder="Asset Name (e.g., Last Will)"
          onChange={(e) => setFileName(e.target.value)}
        />
        <button onClick={handleUpload}>Encrypt & Store</button>
      </div>
      {status && <p className="status-msg">{status}</p>}
    </div>
  );
};

export default VaultUpload;
