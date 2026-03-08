import React, { useState } from "react";
import { combine } from "shamir-secret-sharing";
import _sodium from "libsodium-wrappers";

const VaultUnlock: React.FC<{ assetId: string }> = ({ assetId }) => {
  const [shardsInput, setShardsInput] = useState("");
  const [status, setStatus] = useState("");

  const handleUnlock = async () => {
    // The new method allows automation for the system shard to be released.
    if (!shardsInput) return setStatus("Please enter your assigned Shard.");
    setStatus("Fetching vault data and authorizing release...");

    try {
      // getting the encrypted data and the system shard
      const res = await fetch(`/api/vault/download/${assetId}`);
      const asset = await res.json();

      if (!asset || asset.error) return setStatus(asset.error);

      // 2. SECURITY CHECK: Verify the server actually released the system shard
      if (!asset.systemShard) {
        return setStatus(
          "Access Denied: The system shard is still locked. The owner is currently active.",
        );
      }

      await _sodium.ready;
      const sodium = _sodium;

      setStatus("Reconstructing Master Key via Hybrid Consensus...");

      //Reconstructing the key

      // 1. Parsing the input of the user
      const userShards = shardsInput
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s !== "");

      // 2. The math part
      // The total shards collected; so the user shards and system shard together
      const totalCollected = userShards.length + 1;

      if (totalCollected < asset.threshold) {
        return setStatus(
          `Threshold was not met. To unlock, this asset requires ${asset.threshold} shards. You provided ${userShards.length}, System provides 1 automatically.`,
        );
      }

      setStatus(
        `Reconstructing the key (${totalCollected}/${asset.threshold} shards)...`,
      );

      // 3. Converting all the shards to buffers
      const userShardsBuffers = userShards.map((hex) => sodium.from_hex(hex));
      const systemShardBuffer = sodium.from_hex(asset.systemShard);

      // 4. Combine
      const masterKey = await combine([
        ...userShardsBuffers,
        systemShardBuffer,
      ]);

      // decrypting the assets metadata
      const ciphertext = sodium.from_base64(asset.encrypted_data);
      const nonce = sodium.from_base64(asset.nonce);

      const decryptedBytes = sodium.crypto_secretbox_open_easy(
        ciphertext,
        nonce,
        masterKey,
      );

      if (!decryptedBytes || decryptedBytes.length === 0) {
        return setStatus(
          "Decryption Failed: Invalid shard or Database Encrypted Data was Tampered!",
        );
      }

      // Re-verifying the fingerprint for integrity
      setStatus("Verifying File Integrity...");
      const currentHashBuffer = await crypto.subtle.digest(
        "SHA-256",
        decryptedBytes.buffer as ArrayBuffer,
      );
      const currentHashArray = Array.from(new Uint8Array(currentHashBuffer));
      const currentHash = currentHashArray
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      if (currentHash !== asset.fileHash) {
        return setStatus(
          "Critical Error! File Integrity Check failed. The contents may have been altered.",
        );
      }

      // Verifying the digital signature for authenticity
      setStatus("Verifying Certified Signature...");
      const isAuthentic = sodium.crypto_sign_verify_detached(
        sodium.from_hex(asset.signature),
        currentHash,
        sodium.from_hex(asset.public_key),
      );

      if (!isAuthentic) {
        return setStatus(
          "Critical Error! Forgery Detected! The signature does not match the owner.",
        );
      }

      setStatus("Success! File is Authentic.");

      // downloading
      const blob = new Blob([new Uint8Array(decryptedBytes)], {
        type: asset.file_type || "application/octet-stream",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = asset.file_name || "SureWill_Unlocked.bin";
      a.click();

      setStatus("Success! Vault Unlocked and file downloaded.");
    } catch (err) {
      console.error(err);
      setStatus("Decryption Failed: Invalid shard or Asset was Tampered!");
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
