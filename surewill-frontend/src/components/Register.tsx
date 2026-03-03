import React, { useState } from "react";

const Register: React.FC = () => {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");

  const handleRegister = async () => {
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });
      const data = await res.json();
      setStatus(data.message || data.error);
    } catch (err) {
      setStatus("Registration failed. Check if server is running.");
    }
  };

  return (
    <div className="vault-container">
      <h2 className="vault-header">Create Vault Account</h2>
      <div className="input-group">
        <input
          type="text"
          placeholder="Username"
          onChange={(e) => setUsername(e.target.value)}
        />
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
        <button onClick={handleRegister} style={{ backgroundColor: "#4a5568" }}>
          Register
        </button>
      </div>
      {status && <p className="status-msg">{status}</p>}
    </div>
  );
};

export default Register;
