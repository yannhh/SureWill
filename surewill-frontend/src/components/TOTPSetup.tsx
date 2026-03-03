import React, { useState } from "react";

export const TOTPSetup = ({ userId }: { userId: string }) => {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [token, setToken] = useState("");

  const generateQR = async () => {
    const res = await fetch("/api/totp/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const data = await res.json();
    if (data.qrCode) setQrCode(data.qrCode); //
  };

  const verifyTOTP = async () => {
    const res = await fetch("/api/totp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, token }),
    });
    if (res.ok) alert("MFA Protection Active!");
  };

  return (
    <div className="vault-container">
      <h2 className="vault-header">Authenticator Setup</h2>
      {!qrCode ? (
        <button onClick={generateQR}>Generate Pairing Code</button>
      ) : (
        <div className="input-group">
          <div className="qr-frame">
            <img src={qrCode} alt="Scan me" width="200" />
          </div>
          <input
            type="text"
            placeholder="App Code"
            onChange={(e) => setToken(e.target.value)}
          />
          <button onClick={verifyTOTP}>Enable Protection</button>
        </div>
      )}
    </div>
  );
};
