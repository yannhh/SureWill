import React, { useState } from "react";
import { combine } from "shamir-secret-sharing";
import _sodium from "libsodium-wrappers";

const VaultUnlock: React.FC<{ assetId: string }> = ({ assetId }) => {
  const [shardsInput, setShardsInput] = useState("");
  const [status, setStatus] = useState("");

  const handleUnlock = async () => {
    if (!shardsInput) return setStatus("Please enter the required shards.");
    setStatus("Fetching encrypted asset...");

    try {
      // 1. Fetch the encrypted file data and nonce from your Express backend
      const res = await fetch(`/api/vault/download/${assetId}`);
      const asset = await res.json();

      if (!asset || asset.error)
        return setStatus(asset.error || "Asset not found.");

      await _sodium.ready;
      const sodium = _sodium;

      // 2. Process the Shards
      // Convert the comma-separated hex strings back into Uint8Arrays
      const hexShards = shardsInput.split(",").map((s) => s.trim());
      const shardBuffers = hexShards.map((hex) => sodium.from_hex(hex));

      setStatus("Reconstructing Master Key...");

      // 3. SSS RECONSTRUCTION: Combine the shards to restore the Master Key
      // This will automatically fail if the threshold (k) is not met
      const masterKey = await combine(shardBuffers);

      // 4. Prepare for Decryption
      // Convert the Base64 strings from the database back to Uint8Arrays
      const ciphertext = sodium.from_base64(asset.encrypted_data);
      const nonce = sodium.from_base64(asset.nonce);

      setStatus("Decrypting vault contents...");

      // 5. DECRYPTION: Open the secretbox using the reconstructed key
      const decryptedBytes = sodium.crypto_secretbox_open_easy(
        ciphertext,
        nonce,
        masterKey,
      );

      // 6. Trigger File Download in the Browser
      // Convert the raw bytes back into a downloadable file
      const blob = new Blob([new Uint8Array(decryptedBytes)], {
        type: asset.file_type || "application/octet-stream",
      });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = asset.file_name || "SureWill_Unlocked_Asset.bin";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setStatus("Vault Unlocked! File download initiated.");
    } catch (err) {
      console.error(err);
      setStatus("Decryption Failed: Invalid shards or threshold not met.");
    }
  };

  return (
    <div className="vault-container">
      <h3 className="vault-header">Execute Legacy Unlocking</h3>
      <p>
        Enter your assigned Shamir Shards (comma-separated) to meet the
        cryptographic threshold:
      </p>
      <div className="input-group">
        <textarea
          placeholder="e.g., 0102abcd..., 0203bcde..."
          onChange={(e) => setShardsInput(e.target.value)}
          rows={4}
        />
        <button onClick={handleUnlock} style={{ backgroundColor: "#e53e3e" }}>
          Reconstruct & Decrypt
        </button>
      </div>
      {status && <p className="status-msg">{status}</p>}
    </div>
  );
};

export default VaultUnlock;
