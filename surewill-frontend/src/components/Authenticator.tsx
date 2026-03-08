import React, { useState } from "react";

export const Authenticator = ({
  setUserId,
}: {
  setUserId: (id: string) => void;
}) => {
  const [step, setStep] = useState<"login" | "otp">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [tempUserId, setTempUserId] = useState("");

  const login = async () => {
    console.log("you clicked the login button!");

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      console.log("Mic Test, It's working!", data);

      if (data.userId) {
        setTempUserId(data.userId);
        setStep("otp");
      } else {
        alert(data.error || "Login credentials are invalid.");
      }
    } catch (err) {
      console.error("Error: ", err);
    }
  };

  const verifyOtp = async () => {
    const res = await fetch("/api/otp/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: tempUserId, otp }),
    });

    const data = await res.json();
    if (res.ok) setUserId(tempUserId);
  };

  return (
    <div className="vault-container">
      <h2 className="vault-header">SureWill Vault Login</h2>
      {step === "login" ? (
        <div className="input-group">
          <input
            type="email"
            placeholder="Email"
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            placeholder="Password"
            onChange={(e) => setPassword(e.target.value)}
          />
          <button onClick={login}>Unlock Vault</button>
        </div>
      ) : (
        <div className="input-group">
          <p>Check your email (or terminal) for the code.</p>
          <input
            type="text"
            placeholder="6-digit OTP"
            onChange={(e) => setOtp(e.target.value)}
          />
          <button onClick={verifyOtp}>Verify Identity</button>
        </div>
      )}
    </div>
  );
};
