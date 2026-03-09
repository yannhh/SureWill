import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield,
  Mail,
  Lock,
  User,
  Key,
  ArrowRight,
  ArrowLeft,
  CheckCircle,
} from "lucide-react";

const MotionDiv = motion.div;

export const Auth = ({ setUserId }: { setUserId: (id: string) => void }) => {
  const [mode, setMode] = useState<"login" | "register" | "forgot" | "otp">(
    "login",
  );

  //Form States
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [otp, setOtp] = useState("");
  const [tempUserId, setTempUserId] = useState("");

  // UI States
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const inputStyle = {
    backgroundColor: "#F5F1EC",
    border: "1px solid #E8E3DC",
    color: "#2D2926",
    fontFamily: "inherit",
  };
  const inputClass =
    "w-full pl-11 pr-4 py-3.5 rounded-xl text-sm outline-none transition-all focus:ring-2 focus:ring-offset-0 focus:ring-[#7B9E87]/30";

  const handleAction = async () => {
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      if (mode === "login") {
        const res = await fetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        const data = await res.json();

        if (data.userId) {
          setTempUserId(data.userId);
          setMode("otp");
        } else {
          setError(data.error || "Invalid login credentials.");
        }
      } else if (mode === "register") {
        const res = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, email, password }),
        });

        const data = await res.json();

        if (res.ok) {
          setSuccess("Registered! You may log in.");
          setMode("login");
        } else {
          setError(data.error || "Registration failed.");
        }
      } else if (mode === "otp") {
        const res = await fetch("/api/otp/verify-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: tempUserId, otp }),
        });
        if (res.ok) {
          setUserId(tempUserId);
        } else {
          setError("Invalid or expired code.");
        }
      } else if (mode === "forgot") {
        const res = await fetch("/api/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });

        if (res.ok) {
          setSuccess("Password reset link has been sent to your email.");
        } else {
          setError("Failed to send password reset link.");
        }
      }
    } catch (err) {
      setError("Failed to connect to the server.");
    }
    setLoading(false);
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: "#FAF7F2", fontFamily: "'Inter', sans-serif" }}
    >
      {/* Navigation Bar */}
      <header className="w-full flex justify-between items-center p-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-2 text-[#4A7A5A]">
          <Shield className="w-6 h-6" />
          <span className="font-serif text-xl font-medium text-[#2D2926]">
            SureWill
          </span>
        </div>
        <div>
          {mode === "login" ? (
            <button
              onClick={() => setMode("register")}
              className="bg-[#4A7A5A] text-white px-5 py-2.5 rounded-full text-sm font-medium hover:bg-[#7B9E87] transition-colors flex items-center gap-2 shadow-sm"
            >
              Get started <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => setMode("login")}
              className="bg-white text-[#2D2926] border border-[#E8E3DC] px-5 py-2.5 rounded-full text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm"
            >
              Sign in
            </button>
          )}
        </div>
      </header>

      {/* Main Split Content */}
      <main className="flex-1 flex flex-col lg:flex-row items-center justify-between max-w-6xl mx-auto w-full px-6 gap-12 lg:gap-24 mt-10 lg:mt-16 pb-12">
        {/* Left Side: Marketing Copy */}
        <div className="flex-1 max-w-lg">
          <p className="text-[#7B9E87] text-xs font-bold tracking-widest uppercase mb-4">
            Estate Planning, Reimagined
          </p>
          <h1 className="font-serif text-5xl lg:text-7xl leading-tight mb-6 text-[#2D2926]">
            Leave behind <br />
            <span className="text-[#7B9E87] italic">clarity</span> and love.
          </h1>
          <p className="text-[#8C8579] text-lg mb-8 leading-relaxed">
            SureWill guides you through creating your will, protecting your
            assets, and leaving personal messages for the people who matter
            most.
          </p>

          <div className="flex flex-wrap items-center gap-6 text-sm text-[#8C8579]">
            <span className="flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4 text-[#7B9E87]" /> Free to start
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4 text-[#7B9E87]" /> No legal jargon
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4 text-[#7B9E87]" /> Bank-level
              security
            </span>
          </div>
        </div>

        {/* Right Side: Auth Card */}
        <div className="w-full max-w-md relative">
          <div
            className="rounded-3xl p-8 relative overflow-hidden"
            style={{
              backgroundColor: "white",
              border: "1px solid #E8E3DC",
              boxShadow: "0 20px 40px rgba(0,0,0,0.06)",
            }}
          >
            <AnimatePresence mode="wait">
              <MotionDiv
                key={mode}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <h2
                  className="font-serif text-2xl mb-6 text-center"
                  style={{ color: "#2D2926" }}
                >
                  {mode === "login" && "Access Vault"}
                  {mode === "register" && "Create Your Vault"}
                  {mode === "otp" && "Verify Identity"}
                  {mode === "forgot" && "Recover Access"}
                </h2>

                {/* Status Messages */}
                {error && (
                  <div className="mb-4 p-3 rounded-xl text-xs font-medium bg-red-50 text-red-600 border border-red-100">
                    {error}
                  </div>
                )}
                {success && (
                  <div
                    className="mb-4 p-3 rounded-xl text-xs font-medium flex items-center gap-2"
                    style={{
                      backgroundColor: "#F0F5F2",
                      color: "#4A7A5A",
                      border: "1px solid #B8D4BF",
                    }}
                  >
                    <CheckCircle className="w-4 h-4" /> {success}
                  </div>
                )}

                <div className="space-y-4">
                  {mode === "register" && (
                    <div className="relative">
                      <User
                        className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2"
                        style={{ color: "#A8A09A" }}
                      />
                      <input
                        type="text"
                        placeholder="Full Name or Username"
                        className={inputClass}
                        style={inputStyle}
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                      />
                    </div>
                  )}

                  {(mode === "login" ||
                    mode === "register" ||
                    mode === "forgot") && (
                    <div className="relative">
                      <Mail
                        className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2"
                        style={{ color: "#A8A09A" }}
                      />
                      <input
                        type="email"
                        placeholder="Email Address"
                        className={inputClass}
                        style={inputStyle}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                  )}

                  {(mode === "login" || mode === "register") && (
                    <div className="relative">
                      <Lock
                        className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2"
                        style={{ color: "#A8A09A" }}
                      />
                      <input
                        type="password"
                        placeholder="Password"
                        className={inputClass}
                        style={inputStyle}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </div>
                  )}

                  {mode === "otp" && (
                    <div className="relative">
                      <Key
                        className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2"
                        style={{ color: "#A8A09A" }}
                      />
                      <input
                        type="text"
                        placeholder="6-Digit Verification Code"
                        className={inputClass}
                        style={{
                          ...inputStyle,
                          letterSpacing: "0.2em",
                          textAlign: "center",
                          paddingLeft: "1rem",
                        }}
                        value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                      />
                    </div>
                  )}
                </div>

                {/* Action Button */}
                <button
                  onClick={handleAction}
                  disabled={loading}
                  className="w-full flex justify-center items-center gap-2 mt-6 py-3.5 rounded-xl text-white text-sm font-medium transition-all hover:opacity-90 disabled:opacity-70"
                  style={{
                    background: "linear-gradient(135deg, #7B9E87, #4A7A5A)",
                    boxShadow: "0 4px 16px rgba(123,158,135,0.3)",
                  }}
                >
                  {loading ? (
                    "Processing..."
                  ) : (
                    <>
                      {mode === "login" && "Unlock Vault"}
                      {mode === "register" && "Initialize Vault"}
                      {mode === "otp" && "Verify Code"}
                      {mode === "forgot" && "Send Reset Link"}
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                {/* Navigation Links */}
                <div
                  className="mt-6 text-center text-xs"
                  style={{ color: "#8C8579" }}
                >
                  {mode === "login" && (
                    <div className="flex flex-col gap-3">
                      <button
                        onClick={() => setMode("forgot")}
                        className="hover:text-[#4A7A5A] transition-colors"
                      >
                        Forgot your password?
                      </button>
                    </div>
                  )}
                  {(mode === "forgot" || mode === "otp") && (
                    <button
                      onClick={() => setMode("login")}
                      className="flex items-center justify-center gap-1.5 mx-auto hover:text-[#4A7A5A] transition-colors"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" /> Back to login
                    </button>
                  )}
                </div>
              </MotionDiv>
            </AnimatePresence>
          </div>
        </div>
      </main>
    </div>
  );
};
