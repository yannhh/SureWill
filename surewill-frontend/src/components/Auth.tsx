import React, { useState, useEffect } from "react";
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
  AlertCircle,
  Eye,
  EyeOff,
} from "lucide-react";
import _sodium from "libsodium-wrappers-sumo";

const MotionDiv = motion.div;

export const Auth = ({
  setUserId,
  onSwitchToHeir,
}: {
  setUserId: (id: string) => void;
  onSwitchToHeir: () => void;
}) => {
  const [mode, setMode] = useState<
    "login" | "register" | "forgot" | "otp" | "reset"
  >("login");

  // states for form inputs
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [otp, setOtp] = useState("");
  const [tempUserId, setTempUserId] = useState("");
  const [estatePreference, setEstatePreference] = useState("standard");
  const [showPassword, setShowPassword] = useState(false);

  // states for UI
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

  const modeSwitcher = (
    newMode: "login" | "register" | "forgot" | "otp" | "reset",
  ) => {
    // always clears the error and success messages
    setError("");
    setSuccess("");

    // This keeps the login credentials after the user registers
    const isLoginRegisterSwap =
      (mode === "login" && newMode === "register") ||
      (mode === "register" && newMode === "login");

    if (!isLoginRegisterSwap) {
      setPassword(""); // removes the password on the screen
    }

    setOtp(""); // Always scrubs the OTP box
    setMode(newMode);
  };
  // Checks the URL parameters on mount to initiate the password reset flow if a token is present.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (token && window.location.pathname === "/reset-password") {
      setMode("reset");
    }
  }, []);

  const handleAction = async () => {
    setError("");
    setSuccess("");

    /**
     * Input Sanitization
     * Inputs are trimmed to ensure that accidental trailing spaces do not compromise
     * the cryptographic hashing processes later in the execution.
     */
    const cleanEmail = email.trim().toLowerCase();
    const cleanOtp = otp.trim();

    /**
     * Input Validation
     * Strict validation ensures the cryptography library receives valid string formats,
     * preventing fatal application crashes during the hashing phase.
     */
    if (mode === "register" && !username.trim()) {
      return setError("Please enter a full name or username.");
    }
    if (
      (mode === "login" || mode === "register" || mode === "reset") &&
      !password
    ) {
      return setError("Please enter a password.");
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (
      (mode === "login" || mode === "register" || mode === "forgot") &&
      !emailRegex.test(cleanEmail)
    ) {
      return setError("Please enter a valid email address.");
    }

    setLoading(true);

    try {
      let publicKeyHex = "";
      let privateKeyHex = "";

      /**
       * Deterministic Key Derivation
       * This forms the core "Zero-Knowledge" architecture of the application.
       * The client browser derives cryptographic keys locally rather than relying
       * on a centralized server for key generation.
       */
      if (mode === "login" || mode === "register") {
        await _sodium.ready;
        const sodium = _sodium;

        // The user's email functions as a cryptographic salt, ensuring unique keys even in the event of identical passwords.
        const saltStr = cleanEmail.padEnd(16, " ").slice(0, 16);
        const salt = sodium.from_string(saltStr);

        /**
         * Argon2id is implemented for password hashing due to its high resistance to GPU cracking and side-channel attacks.
         * This step generates a secure master seed from the provided password.
         */
        const seed = sodium.crypto_pwhash(
          sodium.crypto_sign_SEEDBYTES,
          password,
          salt,
          sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
          sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
          sodium.crypto_pwhash_ALG_ARGON2ID13,
        );

        /**
         * The master seed generates an Ed25519 keypair.
         * This "identity key" is utilized to digitally sign vault uploads, mathematically proving the owner's identity.
         */
        const identityKeypair = sodium.crypto_sign_seed_keypair(seed);
        publicKeyHex = sodium.to_hex(identityKeypair.publicKey);
        privateKeyHex = sodium.to_hex(identityKeypair.privateKey);
      }

      // Endpoint routing and payload construction are dynamically assigned based on the current UI state.
      let endpoint = "";
      let bodyPayload: any = {};

      if (mode === "login") {
        endpoint = "/api/login";
        bodyPayload = { email: cleanEmail, password };
      } else if (mode === "register") {
        endpoint = "/api/register";
        bodyPayload = {
          username,
          email: cleanEmail,
          password,
          publicKey: publicKeyHex,
          estatePreference: estatePreference,
        };
      } else if (mode === "otp") {
        endpoint = "/api/otp/verify-otp";
        bodyPayload = { userId: tempUserId, otp: cleanOtp };
      } else if (mode === "forgot") {
        endpoint = "/api/forgot-password";
        bodyPayload = { email: cleanEmail };
      } else if (mode === "reset") {
        endpoint = "/api/reset-password";
        const params = new URLSearchParams(window.location.search);
        bodyPayload = { token: params.get("token"), newPassword: password };
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload),
      });

      /**
       * Server Availability Check
       * If the backend server is offline, the proxy may return an HTML error page.
       * Validating the content-type prevents unexpected JSON parsing crashes in the browser environment.
       */
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error(
          "Backend server is offline! Please ensure the Node.js backend is running.",
        );
      }

      const data = await res.json();

      // Network Response Handling
      if (mode === "login") {
        if (data.userId) {
          /**
           * Key Security Protocol
           * The private key is temporarily stored in session storage. It remains in volatile memory
           * for the duration of the active session and is strictly prevented from persisting in local storage.
           */
          sessionStorage.setItem("surewill_identity_key", privateKeyHex);
          setTempUserId(data.userId);
          setMode("otp");
          modeSwitcher("otp");
          setSuccess("Verification code sent to your email.");
        } else {
          setError(data.error || "Invalid login credentials.");
        }
      } else if (mode === "register") {
        if (res.ok) {
          setSuccess("Registration complete. Initialization available.");
          setTimeout(() => modeSwitcher("login"), 1500);
        } else {
          setError(data.error || "Registration failed.");
        }
      } else if (mode === "otp") {
        if (res.ok) {
          sessionStorage.setItem("surewill_jwt", data.token);
          setUserId(tempUserId);
        } else {
          setError("Invalid or expired authentication code.");
        }
      } else if (mode === "forgot") {
        if (res.ok) {
          setSuccess("Password reset token has been sent to your email.");
        } else {
          setError(
            "Failed to issue reset token. Ensure the email is registered in the database.",
          );
        }
      } else if (mode === "reset") {
        if (res.ok) {
          setSuccess("Cryptographic credentials updated successfully!");
          // Sanitizes the URL history to prevent token leakage
          window.history.pushState({}, document.title, "/");
          setTimeout(() => {
            modeSwitcher("login");
            setPassword("");
          }, 2000);
        } else {
          setError(data.error || "Failed to update security credentials.");
        }
      }
    } catch (err: any) {
      console.error("Authentication Error:", err);
      setError(err.message || "An unexpected system error occurred.");
    }
    setLoading(false);
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: "#FAF7F2", fontFamily: "'Inter', sans-serif" }}
    >
      {/* Navigation Header */}
      <header className="w-full flex justify-between items-center p-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-2 text-[#4A7A5A]">
          <Shield className="w-6 h-6" />
          <span className="font-serif text-xl font-medium text-[#2D2926]">
            SureWill
          </span>
        </div>
        <div className="flex items-center gap-6">
          <button
            onClick={onSwitchToHeir}
            className="text-sm font-medium text-[#8C8579] hover:text-[#4A7A5A] transition-colors"
          >
            Claim an Asset
          </button>
          {mode === "login" ? (
            <button
              onClick={() => modeSwitcher("register")}
              className="bg-[#4A7A5A] text-white px-5 py-2.5 rounded-full text-sm font-medium hover:bg-[#7B9E87] transition-colors flex items-center gap-2 shadow-sm"
            >
              Get started <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => modeSwitcher("login")}
              className="bg-white text-[#2D2926] border border-[#E8E3DC] px-5 py-2.5 rounded-full text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm"
            >
              Sign in
            </button>
          )}
        </div>
      </header>

      {/* Main Split Layout */}
      <main className="flex-1 flex flex-col lg:flex-row items-center justify-between max-w-6xl mx-auto w-full px-6 gap-12 lg:gap-24 mt-10 lg:mt-16 pb-12">
        {/* Left Section: Value Proposition */}
        <div className="flex-1 max-w-lg">
          <p className="text-[#7B9E87] text-xs font-bold tracking-widest uppercase mb-4">
            Zero-Knowledge Estate Vault
          </p>
          <h1 className="font-serif text-5xl lg:text-7xl leading-tight mb-6 text-[#2D2926]">
            Your legacy, <br />
            <span className="text-[#7B9E87] italic">secured</span> by
            mathematics.
          </h1>
          <p className="text-[#8C8579] text-lg mb-8 leading-relaxed">
            More than just your last will - an impenetrable vault for your
            digital assets. Protect your digital wealth, document your estate,
            keep family memories and leave private messages that remain
            mathematically locked until the right moment.
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

        {/* Right Section: Authentication Interface */}
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
                  {mode === "reset" && "Set New Password"}
                </h2>

                {/* System Feedback UI */}
                {error && (
                  <div className="mb-4 p-3 rounded-xl text-xs font-medium bg-red-50 text-red-600 border border-red-100 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
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
                    <CheckCircle className="w-4 h-4 flex-shrink-0" /> {success}
                  </div>
                )}

                <div className="space-y-4">
                  {/* Security Badge for Token Authentication */}
                  {mode === "reset" && (
                    <div className="mb-2 p-5 rounded-2xl bg-[#F0F5F2] border border-[#B8D4BF] text-center">
                      <Shield className="w-8 h-8 text-[#4A7A5A] mx-auto mb-2 opacity-80" />
                      <h4 className="text-[#2D2926] font-medium mb-1">
                        Secure Reset
                      </h4>
                      <p className="text-xs text-[#4A7A5A] leading-relaxed">
                        Your identity has been verified securely using your
                        email token. Enter your new password.
                      </p>
                    </div>
                  )}
                  {mode === "register" && (
                    <>
                      {/* Islamic Inheritance Configuration Toggle */}
                      <div className="p-4 rounded-xl border border-[#E8E3DC] bg-white">
                        <label className="flex items-start gap-3 cursor-pointer">
                          <div className="relative flex items-center mt-1">
                            <input
                              type="checkbox"
                              className="sr-only"
                              checked={estatePreference === "sharia"}
                              onChange={(e) =>
                                setEstatePreference(
                                  e.target.checked ? "sharia" : "standard",
                                )
                              }
                            />
                            <div
                              className={`block w-10 h-6 rounded-full transition-colors ${estatePreference === "sharia" ? "bg-[#C9A96E]" : "bg-gray-200"}`}
                            ></div>
                            <div
                              className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${estatePreference === "sharia" ? "transform translate-x-4" : ""}`}
                            ></div>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-[#2D2926]">
                              Enable Islamic Inheritance (Faraid)
                            </p>
                            <p className="text-xs text-[#8C8579] mt-1 leading-relaxed">
                              Activating this framework tailors the vault
                              configuration to calculate financial allocations
                              according to Sharia proportions based on
                              registered beneficiaries.
                            </p>
                          </div>
                        </label>
                      </div>

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
                    </>
                  )}

                  {/* Email Input is active during login, registration, and initial password recovery */}
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

                  {/* Password Input is active during login, registration, and the final reset stage */}
                  {(mode === "login" ||
                    mode === "register" ||
                    mode === "reset") && (
                    <div className="relative">
                      <Lock
                        className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2"
                        style={{ color: "#A8A09A" }}
                      />
                      <input
                        type={showPassword ? "text" : "password"}
                        placeholder={
                          mode === "reset" ? "Enter New Password" : "Password"
                        }
                        className={inputClass}
                        style={{
                          ...inputStyle,
                          paddingRight: "3rem",
                        }}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />

                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-[#A8A09A] hover:text-[#4A7A5A] transition-colors focus:outline-none"
                      >
                        {showPassword ? (
                          <EyeOff className="w-5 h-5" />
                        ) : (
                          <Eye className="w-5 h-5" />
                        )}
                      </button>
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

                {/* Form Submission Button */}
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
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      {mode === "login" && "Unlock Vault"}
                      {mode === "register" && "Initialize Vault"}
                      {mode === "otp" && "Verify Identity"}
                      {mode === "forgot" && "Send Reset Link"}
                      {mode === "reset" && "Update Password"}
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                {/* Auxiliary Navigation Actions */}
                <div
                  className="mt-6 text-center text-xs"
                  style={{ color: "#8C8579" }}
                >
                  {mode === "login" && (
                    <div className="flex flex-col gap-3">
                      <button
                        onClick={() => modeSwitcher("forgot")}
                        className="hover:text-[#4A7A5A] transition-colors"
                      >
                        Forgot your password?
                      </button>
                    </div>
                  )}
                  {(mode === "forgot" || mode === "otp") && (
                    <button
                      onClick={() => modeSwitcher("login")}
                      className="flex items-center justify-center gap-1.5 mx-auto hover:text-[#4A7A5A] transition-colors"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" /> Return to Login
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
