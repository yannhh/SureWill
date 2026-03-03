import React, { useState } from "react";

interface LoginProps {
  onLoginSuccess: (id: string) => void;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async () => {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (data.userId) {
      onLoginSuccess(data.userId); //
    } else {
      alert(data.error || "Login failed");
    }
  };

  return (
    <div className="vault-container">
      <h2 className="vault-header">Vault Access</h2>
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
        <button onClick={handleLogin}>Authenticate</button>
      </div>
    </div>
  );
};

export default Login;
