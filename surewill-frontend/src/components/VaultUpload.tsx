import React, { useState } from "react";
import { split } from "shamir-secret-sharing";
import _sodium from "libsodium-wrappers";

const VaultUpload: React.FC<{
  userId: string;
  heirCount: number;
  onAssetUploaded: () => void;
}> = ({ userId, heirCount, onAssetUploaded }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState("");

  const [nTotal, setNTotal] = useState(2); //Default is 2
  const [kThreshold, setKThreshold] = useState(2);

  const handleUpload = async () => {
    if (!selectedFile) return setStatus("No file selected");

    // Note: Final version will use libsodium here

    // SSS Restriction of Shard Distribution
    const shardsForHeirs = nTotal - 1;
    if (shardsForHeirs > heirCount) {
      return setStatus(
        `Error! You are generating ${shardsForHeirs} distributable shards. You have ${heirCount} registered heirs. Register more heirs, or lower your Total Shards (n).`,
      );
    }
    if (kThreshold > nTotal)
      return setStatus("Required (k) cannot exceed Total Shards (n)!");

    // 1. This is the Mock master key
    setStatus("Encrypting and Splitting shards...");
    await _sodium.ready;
    const sodium = _sodium;

    const fileBuffer = await selectedFile.arrayBuffer();
    const fileData = new Uint8Array(fileBuffer);

    const masterKey = sodium.randombytes_buf(sodium.crypto_secretbox_KEYBYTES);

    // Updated this; split is dynamic now as per user input for threshold customizability
    const shards = await split(masterKey, nTotal, kThreshold);

    const hexShards = shards.map((s) => sodium.to_hex(s));

    // Generating the Nonce (basically a one time random number)
    // It's required for security, so it never reuses a nonce with the same key
    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);

    // Encrypting the data
    // hexShards is the Uint8Array file
    const ciphertext = sodium.crypto_secretbox_easy(fileData, nonce, masterKey);

    // Preparing the data for transit
    const encryptedBase64 = sodium.to_base64(ciphertext);
    const nonceBase64 = sodium.to_base64(nonce);

    // Generating the SHA-256 Fingerprint for Anti Forgery
    setStatus("Generating Anti-Forgery Fingerprint..");
    const hashBuffer = await crypto.subtle.digest("SHA-256", fileData);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const fileHash = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Generating Digital Signature for Certified Authenticity of the file
    setStatus("Signing Document with Digital Signature");
    const signingKeypair = sodium.crypto_sign_keypair();
    const signature = sodium.crypto_sign_detached(
      fileHash,
      signingKeypair.privateKey,
    );

    // 5. Sending it to the backend
    const res = await fetch("/api/vault/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        encryptedData: encryptedBase64, //
        nonce: nonceBase64,
        shards: hexShards,
        threshold: kThreshold,
        totalShards: nTotal,
        fileHash: fileHash,
        signature: sodium.to_hex(signature),
        publicKey: sodium.to_hex(signingKeypair.publicKey),
        fileName: fileName || selectedFile.name,
        fileType: selectedFile.type,
        fileSize: selectedFile.size,
      }),
    });
    const data = await res.json();

    if (res.ok) {
      setStatus(data.message || "Upload Successful!");
      onAssetUploaded();
    } else {
      setStatus(data.error || "Upload failed.");
    }
  };

  return (
    <div className="vault-container">
      <h3 className="vault-header">Secure Asset Upload</h3>
      <div className="input-group">
        {/*Added the actual File Input HERE*/}
        <input
          type="file"
          onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
        />
        <input
          type="text"
          placeholder="Asset Name (e.g., Last Will)"
          onChange={(e) => setFileName(e.target.value)}
        />

        <div
          style={{
            display: "flex",
            gap: "15px",
            margin: "10px",
            fontSize: "14px",
          }}
        >
          <label>
            <strong>Total Shards (n):</strong>
            <input
              type="number"
              min="2"
              max={heirCount + 1}
              value={nTotal}
              onChange={(e) => setNTotal(Number(e.target.value))}
              style={{ width: "60px", marginLeft: "5px" }}
            />
          </label>

          <label>
            <strong>Required (k):</strong>
            <input
              type="number"
              min="2"
              max={nTotal}
              value={kThreshold}
              onChange={(e) => setKThreshold(Number(e.target.value))}
              style={{ width: "60px", marginLeft: "5px" }}
            />
          </label>
        </div>

        <button onClick={handleUpload}>Encrypt & Store</button>
      </div>
      {status && <p className="status-msg">{status}</p>}
    </div>
  );
};

export default VaultUpload;
