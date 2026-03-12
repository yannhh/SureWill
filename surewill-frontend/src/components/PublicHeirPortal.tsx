import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield,
  Key,
  ArrowLeft,
  Lock,
  FileText,
  CheckCircle,
  AlertCircle,
  Smartphone,
} from "lucide-react";
import { combine } from "shamir-secret-sharing";
import _sodium from "libsodium-wrappers-sumo";
import { assert } from "node:console";

const MotionDiv = motion.div;

export const PublicHeirPortal = ({ onBack }: { onBack: () => void }) => {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"email" | "otp" | "claims" | "unlock">(
    "email",
  );
  const [claims, setClaims] = useState<any[]>([]);
  const [heirName, setHeirName] = useState("");
  const [activeClaim, setActiveClaim] = useState<{
    id: string;
    shard: string;
  } | null>(null);

  const [showCondition, setShowCondition] = useState(""); // This is for showing the unlock condition to the heir

  const [shardsInput, setShardsInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ type: "", msg: "" });

  const inputClass =
    "w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-all focus:ring-2 focus:ring-offset-0 focus:ring-[#7B9E87]/30";

  const requestSMS = async () => {
    if (!email)
      return setStatus({
        type: "error",
        msg: "Please enter your registered email.",
      });
    setLoading(true);
    setStatus({ type: "", msg: "" });

    try {
      const res = await fetch(`/api/beneficiary/request-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.toLowerCase().trim() }),
      });
      const data = await res.json();

      if (res.ok) {
        setStep("otp");
      } else {
        setStatus({
          type: "error",
          msg: data.error || "Failed to locate claim.",
        });
      }
    } catch (err) {
      setStatus({ type: "error", msg: "Failed to connect to secure server." });
    }
    setLoading(false);
  };

  const verifySMS = async () => {
    if (!otp)
      return setStatus({ type: "error", msg: "Please enter the SMS code." });
    setLoading(true);
    setStatus({ type: "", msg: "" });

    try {
      const res = await fetch(`/api/beneficiary/claims`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.toLowerCase().trim(),
          otp: otp.trim(),
        }),
      });
      const data = await res.json();

      if (res.ok) {
        setClaims(data.claims || []);
        setHeirName(data.fullName);
        setStep("claims");
      } else {
        setStatus({ type: "error", msg: data.error || "Invalid SMS code." });
      }
    } catch (err) {
      setStatus({ type: "error", msg: "Failed to connect to secure server." });
    }
    setLoading(false);
  };

  const handleUnlock = async () => {
    // Using this targetId to make sure I have the right database reference, even if object names are slightly different between the frontend and backend response.
    const targetId = activeClaim?.id || (activeClaim as any)?.assetId;
    if (!targetId || targetId === "undefined") {
      return setStatus({
        type: "error",
        msg: "Error: Asset ID not found. Please go back and re-select the claim.",
      });
    }

    setLoading(true);
    setStatus({
      type: "info",
      msg: "Authorizing release and retrieving cryptographic metadata...",
    });

    try {
      // This fetches the secure download endpoint to get the encrypted file data and system shard.
      const res = await fetch(`/api/vault/download/${targetId}`);
      const asset = await res.json();

      if (!asset || asset.error)
        throw new Error(asset.error || "Failed to fetch asset.");

      // If the owner leaves an unlock condition note, It will update and show it.
      if (asset.unlockCondition) setShowCondition(asset.unlockCondition);

      // This is the Dead Man's Switch guard. If the monitor script hasn't triggered access_granted for the heirs, then the backend wont send the system shard.
      if (!asset.systemShard) {
        throw new Error(
          "Access Denied: The system shard is still locked. The owner is currently active.",
        );
      }

      // This preps the Cryptography
      // This waits for libsodium to be loaded into the browser
      await _sodium.ready;
      const sodium = _sodium;

      // Parses shards the user might have pasted (like other beneficiaries pasting in their shards) and cleaning up accidental spaces.
      // This ensures that the input is correct and matches the actual shard the Shamir's Secret is expecting.
      const extraShards = shardsInput
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s !== "");

      // then Calculates the total shards, 1 for the system (by default) and 1 for the heir, + any extras if there are
      const totalCollected = 2 + extraShards.length;

      // This checks the threshold, If the user hasn't given enough pieces for the k value of the Shamir's Secret Math, this stops them from continuing.
      if (totalCollected < asset.threshold) {
        throw new Error(
          `Threshold not met. This vault requires ${asset.threshold} total shards.`,
        );
      }

      /**
       * Reconstructing the master key
       * This is the core mathematics part.
       * I combine all fragments back into a single 32-byte key using Shamir's Secret Sharing.
       */
      const masterKey = await combine([
        sodium.from_hex(activeClaim!.shard), // Auto-inject the Heir's primary shard
        sodium.from_hex(asset.systemShard), // Auto-inject the System shard
        ...extraShards.map((hex) => sodium.from_hex(hex)), // Add any additional shards they pasted
      ]);

      /**
       * The Decryption
       * Now that I have reconstructed the master key, I use Libsodium's secretbox to unlock the file data.
       */
      const decryptedBytes = sodium.crypto_secretbox_open_easy(
        sodium.from_base64(asset.encrypted_data),
        sodium.from_base64(asset.nonce),
        masterKey,
      );

      if (!decryptedBytes)
        throw new Error("Decryption failed. Invalid or tampered shard.");

      /**
       * This is the security identity check (Defense in Depth)
       */
      setStatus({
        type: "info",
        msg: "Verifying File Integrity & Identity Binding...",
      });

      /**
       * Added this, because my decryptedBytes would always be expecting a different parse and gives errors.
       * Browsers are picky about datatypes, so I force decryptedBytes to Uint8Array.
       */
      const safeBuffer =
        decryptedBytes instanceof Uint8Array
          ? decryptedBytes
          : new Uint8Array(decryptedBytes as any);

      /**
       * Recalculating the SHA-256 hash of the decrypted file.
       * Makes sure it wasn't modified in the database.
       */
      const currentHashBuffer = await window.crypto.subtle.digest(
        "SHA-256",
        safeBuffer,
      );
      const currentHashArray = Array.from(new Uint8Array(currentHashBuffer));
      const currentHash = currentHashArray
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      if (currentHash !== asset.fileHash) {
        throw new Error(
          "Integrity Check failed. The database payload was altered!",
        );
      }

      /**
       * Finally, verifying the digital signature.
       * Proves that the owner's private key was used to sign the file hash during uploading.
       */
      const publicKeyToVerify = asset.public_key || asset.ownerPublicKey;
      if (!publicKeyToVerify)
        throw new Error("Missing public key to verify signature.");

      const isAuthentic = sodium.crypto_sign_verify_detached(
        sodium.from_hex(asset.signature),
        currentHash,
        sodium.from_hex(publicKeyToVerify),
      );

      if (!isAuthentic) {
        throw new Error("Forgery Detected! Signature mismatch.");
      }

      /**
       * I'm turning the final clean bytes into a Binary Large Object (blob) here.
       * So the browser can download it as a real file.
       */
      const blob = new Blob([safeBuffer], {
        type: asset.file_type || "application/octet-stream",
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = asset.file_name || "SureWill_Unlocked.bin";
      a.click();

      // I revoke the URL after 1 second to clear browser memory.
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      setStatus({
        type: "success",
        msg: "Success! Vault Unlocked and file downloaded.",
      });
    } catch (err: any) {
      console.error("Decryption Error:", err);
      setStatus({
        type: "error",
        msg: err.message || "An unexpected error occurred.",
      });
    }
    setLoading(false);
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: "#FAF7F2", fontFamily: "'Inter', sans-serif" }}
    >
      <header className="w-full flex justify-between items-center p-6 max-w-7xl mx-auto">
        <div
          className="flex items-center gap-2 text-[#4A7A5A] cursor-pointer"
          onClick={onBack}
        >
          <Shield className="w-6 h-6" />
          <span className="font-serif text-xl font-medium text-[#2D2926]">
            SureWill
          </span>
        </div>
        <button
          onClick={onBack}
          className="text-sm font-medium text-[#8C8579] hover:text-[#4A7A5A] transition-colors flex items-center gap-1.5"
        >
          <ArrowLeft className="w-4 h-4" /> Return to Home
        </button>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 pb-20">
        <div className="w-full max-w-lg">
          <div className="text-center mb-8">
            <h1 className="font-serif text-4xl mb-2 text-[#2D2926]">
              Claim Portal
            </h1>
            <p className="text-sm text-[#8C8579]">
              Execute legacy unlocking using your assigned credentials.
            </p>
          </div>

          <div
            className="rounded-3xl p-8 bg-white border border-[#E8E3DC]"
            style={{ boxShadow: "0 20px 40px rgba(0,0,0,0.06)" }}
          >
            <AnimatePresence mode="wait">
              {step === "email" && (
                <MotionDiv
                  key="email"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                >
                  <div className="mb-6">
                    <label className="block text-xs font-medium mb-1.5 text-[#4A453F]">
                      Registered Heir Email
                    </label>
                    <input
                      type="email"
                      placeholder="Enter your email address"
                      className={inputClass}
                      style={{
                        backgroundColor: "#F5F1EC",
                        border: "1px solid #E8E3DC",
                        color: "#2D2926",
                      }}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>

                  {status.msg && (
                    <div className="mb-6 p-3 rounded-xl text-xs font-medium flex items-center gap-2 bg-red-50 text-red-600 border border-red-100">
                      <AlertCircle className="w-4 h-4" /> {status.msg}
                    </div>
                  )}

                  <button
                    onClick={requestSMS}
                    disabled={loading}
                    className="w-full flex justify-center items-center gap-2 py-3.5 rounded-xl text-white text-sm font-medium transition-all hover:opacity-90 disabled:opacity-70"
                    style={{
                      background: "linear-gradient(135deg, #7B9E87, #4A7A5A)",
                    }}
                  >
                    {loading
                      ? "Locating Claim..."
                      : "Send SMS Verification Code"}{" "}
                    <Smartphone className="w-4 h-4" />
                  </button>
                </MotionDiv>
              )}

              {step === "otp" && (
                <MotionDiv
                  key="otp"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                >
                  <div className="mb-6">
                    <label className="block text-xs font-medium mb-1.5 text-[#4A453F]">
                      Secure SMS Code
                    </label>
                    <input
                      type="text"
                      placeholder="6-digit code"
                      className={inputClass}
                      style={{
                        backgroundColor: "#F5F1EC",
                        border: "1px solid #E8E3DC",
                        color: "#2D2926",
                        letterSpacing: "0.2em",
                        textAlign: "center",
                      }}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                    />
                    <p className="text-[10px] text-[#8C8579] mt-2 text-center">
                      We sent a verification code to the mobile number on file.
                    </p>
                  </div>

                  {status.msg && (
                    <div className="mb-6 p-3 rounded-xl text-xs font-medium flex items-center gap-2 bg-red-50 text-red-600 border border-red-100">
                      <AlertCircle className="w-4 h-4" /> {status.msg}
                    </div>
                  )}

                  <button
                    onClick={verifySMS}
                    disabled={loading}
                    className="w-full flex justify-center items-center gap-2 py-3.5 rounded-xl text-white text-sm font-medium transition-all hover:opacity-90 disabled:opacity-70"
                    style={{
                      background: "linear-gradient(135deg, #7B9E87, #4A7A5A)",
                    }}
                  >
                    {loading ? "Verifying..." : "Verify & View Claims"}{" "}
                    <Key className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      setStep("email");
                      setStatus({ type: "", msg: "" });
                    }}
                    className="w-full mt-4 text-xs text-[#8C8579] hover:text-[#4A7A5A] transition-colors"
                  >
                    ← Use a different email
                  </button>
                </MotionDiv>
              )}

              {step === "claims" && (
                <MotionDiv
                  key="claims"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                >
                  <h3 className="text-lg font-medium mb-4 text-[#2D2926]">
                    Welcome, {heirName}
                  </h3>
                  <p className="text-sm text-[#8C8579] mb-6">
                    The following encrypted assets have been released to you.
                    Select one to begin the decryption process.
                  </p>

                  <div className="space-y-3 mb-6">
                    {claims.map((claim, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setActiveClaim({
                            id: claim.assetId,
                            shard: claim.shard,
                          });
                          setStep("unlock");
                          setStatus({ type: "", msg: "" });
                        }}
                        className="w-full flex items-center justify-between p-4 rounded-xl border border-[#E8E3DC] hover:border-[#7B9E87] transition-colors group text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-[#F0F5F2] flex items-center justify-center text-[#4A7A5A]">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-[#2D2926]">
                              Encrypted Asset
                            </p>
                            <p className="text-[10px] text-[#8C8579] font-mono mt-0.5">
                              ID: {claim.assetId.slice(0, 8)}...
                            </p>
                          </div>
                        </div>
                        <ArrowLeft className="w-4 h-4 rotate-180 text-[#C4BEB6] group-hover:text-[#4A7A5A] transition-colors" />
                      </button>
                    ))}
                  </div>
                </MotionDiv>
              )}

              {/* STEP 4: UNLOCK & DECRYPT */}
              {step === "unlock" && activeClaim && (
                <MotionDiv
                  key="unlock"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                >
                  <div className="flex items-center gap-2 mb-4">
                    <Lock className="w-5 h-5 text-[#C9A96E]" />
                    <h3 className="text-lg font-medium text-[#2D2926]">
                      Decrypt Asset
                    </h3>
                  </div>

                  {showCondition && (
                    <div className="mb-4 p-4 rounded-xl border border-[#C9A96E]/30 bg-[#FDF6ED]">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-[#A07030] mb-1">
                        Owner's Reveal Condition:
                      </p>
                      <p className="text-sm italic text-[#2D2926]">
                        "{showCondition}"
                      </p>
                    </div>
                  )}

                  <div className="mb-4 p-4 rounded-xl bg-[#F0F5F2] border border-[#B8D4BF]">
                    <p className="text-xs text-[#2D2926] mb-1">
                      <strong>Your Primary Shard:</strong>
                    </p>
                    <code className="text-[10px] break-all text-[#4A7A5A] select-all block mb-2">
                      {activeClaim.shard}
                    </code>
                    <p className="text-[10px] text-[#8C8579] italic">
                      If the vault requires more than 2 shards, ask other
                      beneficiaries for their shards and separate them with
                      commas below.
                    </p>
                  </div>

                  <div className="mb-6">
                    <label className="block text-xs font-medium mb-1.5 text-[#4A453F]">
                      Enter Cryptographic Shards
                    </label>
                    <textarea
                      placeholder="e.g., 0102abcd..., 0203bcde..."
                      className={inputClass}
                      style={{
                        backgroundColor: "#F5F1EC",
                        border: "1px solid #E8E3DC",
                        color: "#2D2926",
                        minHeight: "100px",
                        fontFamily: "monospace",
                        fontSize: "11px",
                      }}
                      value={shardsInput}
                      onChange={(e) => setShardsInput(e.target.value)}
                    />
                  </div>

                  {status.msg && (
                    <div
                      className={`mb-6 p-3 rounded-xl text-xs font-medium flex items-start gap-2 border ${status.type === "error" ? "bg-red-50 text-red-600 border-red-100" : status.type === "success" ? "bg-[#F0F5F2] text-[#4A7A5A] border-[#B8D4BF]" : "bg-blue-50 text-blue-700 border-blue-100"}`}
                    >
                      {status.type === "error" ? (
                        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      ) : (
                        <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      )}
                      <span>{status.msg}</span>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={handleUnlock}
                      disabled={loading}
                      className="flex-1 flex justify-center items-center gap-2 py-3.5 rounded-xl text-white text-sm font-medium transition-all hover:opacity-90 disabled:opacity-70"
                      style={{
                        background: "linear-gradient(135deg, #C9A96E, #A07030)",
                      }}
                    >
                      {loading ? "Reconstructing..." : "Reconstruct & Decrypt"}
                    </button>
                    <button
                      onClick={() => {
                        setStep("claims");
                        setStatus({ type: "", msg: "" });
                        setShardsInput("");
                      }}
                      className="px-5 py-3.5 rounded-xl text-sm font-medium bg-[#F5F1EC] text-[#8C8579] hover:bg-[#E8E3DC] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </MotionDiv>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>
    </div>
  );
};
