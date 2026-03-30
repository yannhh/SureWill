import React, { useState, useEffect, useRef } from "react";
import { split } from "shamir-secret-sharing";
import _sodium from "libsodium-wrappers-sumo";
import { motion, AnimatePresence } from "framer-motion";
import {
  Lock,
  Upload,
  Trash2,
  FileText,
  Image as ImageIcon,
  Video,
  DollarSign,
  Scale,
  Heart,
  Key,
  Package,
  Plus,
  X,
  Check,
  Shield,
} from "lucide-react";

const MotionDiv = motion.div;

const CATEGORIES = [
  { value: "document", label: "Document", icon: FileText, color: "#7B9E87" },
  { value: "photo", label: "Photo", icon: ImageIcon, color: "#C9A96E" },
  { value: "video", label: "Video", icon: Video, color: "#A07080" },
  {
    value: "financial",
    label: "Financial",
    icon: DollarSign,
    color: "#6090A0",
  },
  { value: "legal", label: "Legal", icon: Scale, color: "#8070A0" },
  { value: "personal", label: "Personal", icon: Heart, color: "#C07070" },
  { value: "password", label: "Password", icon: Key, color: "#A09060" },
  { value: "other", label: "Other", icon: Package, color: "#909090" },
];

const getCat = (v: string) =>
  CATEGORIES.find((c) => c.value === v) || CATEGORIES[7];
const EMPTY = {
  title: "",
  category: "document",
  description: "",
  unlock_condition: "",
};

const VaultUpload: React.FC<{
  heirCount: number;
  onAssetUploaded: () => void;
}> = ({ heirCount, onAssetUploaded }) => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [filterCat, setFilterCat] = useState("all");

  // Shamir Shard Settings
  const [nTotal, setNTotal] = useState(2);
  const [kThreshold, setKThreshold] = useState(2);

  // Status states
  const [uploading, setUploading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchItems = async () => {
    try {
      // IDOR Patch
      const token = sessionStorage.getItem("surewill_jwt");

      const res = await fetch(`/api/vault/list`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setItems(data || []);
      setLoading(false);
    } catch (err) {
      console.error("Failed to load vault items");
      setLoading(false);
    }
  };

  const documentObjectWait = () =>
    new Promise((resolve) => setTimeout(resolve, 50));

  const handleDelete = async (itemId: string) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this asset? This cannot be undone.",
      )
    )
      return;

    try {
      // IDOR Patch
      const token = sessionStorage.getItem("surewill_jwt");

      const res = await fetch(`/api/vault/delete/${itemId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        setItems((prev) => prev.filter((i) => i._id !== itemId));
        onAssetUploaded(); // This updates the dashboard progress bar
      } else {
        alert("Failed to delete asset.");
      }
    } catch (err) {
      console.error("Failed to delete asset", err);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const handleSave = async () => {
    setStatusMsg("");

    /**
     * Enforces a strict File Required check.
     * Ensures the encryption engine always has a valid buffer to process.
     */
    if (!file) return setStatusMsg("Error: Please attach a file to encrypt.");

    /**
     * Shamir's Secret Logic Validation
     * This checks the user doesn't try to generate more shards than they have heirs.
     * One shard is always reserved for the system.
     */
    const shardsForHeirs = nTotal - 1;
    if (shardsForHeirs > heirCount) {
      return setStatusMsg(
        `Error: Generating ${shardsForHeirs} shards, but you only have ${heirCount} heirs registered. Lower Total Shards (n).`,
      );
    }

    // This is the math rule, so the user can't exceed the total shards they created
    if (kThreshold > nTotal)
      return setStatusMsg(
        "Error: Required (k) cannot exceed Total Shards (n)!",
      );

    setUploading(true);
    setStatusMsg("Encrypting and Splitting shards...");
    await documentObjectWait();

    // The Cryptography
    try {
      // Initializing Libsodium before using any random number generators.
      await _sodium.ready;
      const sodium = _sodium;

      /**
       * Converts the file into raw byte array,
       * so the encryption math can process it directly
       */
      const fileBuffer = await file.arrayBuffer();
      const fileData = new Uint8Array(fileBuffer);

      /**
       * Generating a cryptographic secure 32-byte Master Key.
       * This master key never leaves the browser in its whole form.
       */
      const masterKey = sodium.randombytes_buf(
        sodium.crypto_secretbox_KEYBYTES,
      );

      /**
       * Shamir's Secret Sharing
       * This is where the master key is split into pieces
       * It is converted to hex strings so they can be stored as text in the DB.
       */
      const shards = await split(masterKey, nTotal, kThreshold);
      const hexShards = shards.map((s) => sodium.to_hex(s));

      /**
       * Data Encryption (using SecretBox)
       * This uses XSalsa20-Poly1305 (secretbox) for the encryption.
       * The nonce is a number used once to ensure the same file
       * encrypted twice has a different ciphertext.
       */
      const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
      const ciphertext = sodium.crypto_secretbox_easy(
        fileData,
        nonce,
        masterKey,
      );

      // Everything is encoded to Base64 to make it safe for JSON transport.
      const encryptedBase64 = sodium.to_base64(ciphertext);
      const nonceBase64 = sodium.to_base64(nonce);

      /**
       * The Digital Signature and Integrity
       * Creating a SHA-256 hash of the original file.
       * This acts as the unique fingerprint to detect tampering later.
       */
      setStatusMsg("Generating Anti-Forgery Fingerprint..");
      documentObjectWait();
      const hashBuffer = await crypto.subtle.digest("SHA-256", fileData);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const fileHash = hashArray
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      // Gets the user's private identity key from session memory.
      const privateKeyHex = sessionStorage.getItem("surewill_identity_key");

      if (!privateKeyHex) {
        throw new Error(
          "Cryptographic Identity is missing! Please log in again.",
        );
      }

      const privateKey = sodium.from_hex(privateKeyHex);

      /**
       * Extracting the seed to reconstruct the Ed25519 signing keypair.
       * This is part of the Zero-Knowledge Identity Binding Logic.
       */
      const seed = privateKey.slice(0, 32);
      const identityKeypair = sodium.crypto_sign_seed_keypair(seed);

      /**
       * Finally signing the file hash.
       * This proves that ONLY this user could have uploaded this specific file.
       */
      const signature = sodium.crypto_sign_detached(
        fileHash,
        identityKeypair.privateKey,
      );

      // The secure upload
      setStatusMsg("Uploading to Secure Vault...");

      //IDOR Patch token key
      const token = sessionStorage.getItem("surewill_jwt");

      const res = await fetch("/api/vault/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          encryptedData: encryptedBase64,
          nonce: nonceBase64,
          shards: hexShards, // These shards are sent to be further encrypted by the server, showcasing Defense in Depth.
          threshold: kThreshold,
          totalShards: nTotal,
          fileHash: fileHash,
          signature: sodium.to_hex(signature),
          publicKey: sodium.to_hex(identityKeypair.publicKey), // this uses sodium to safely send the public key
          fileName: form.title || file.name,
          fileType: file.type,
          fileSize: file.size,
          category: form.category,
          description: form.description,
          unlockCondition: form.unlock_condition,
        }),
      });

      if (res.ok) {
        setShowForm(false);
        setForm(EMPTY);
        setFile(null);
        setStatusMsg("");
        fetchItems();
        onAssetUploaded(); // Updates the dashboard UI
      } else {
        const data = await res.json();
        setStatusMsg(data.error || "Upload failed.");
      }
    } catch (err: any) {
      console.error(err);
      setStatusMsg(
        err.message || "A critical error occurred during encryption.",
      );
    }
    setUploading(false);
  };

  const filtered =
    filterCat === "all"
      ? items
      : items.filter((i) => (i.category || "document") === filterCat);

  if (loading)
    return (
      <div className="flex items-center justify-center py-20">
        <div
          className="w-10 h-10 rounded-full border-2 animate-spin"
          style={{ borderColor: "#7B9E87", borderTopColor: "transparent" }}
        />
      </div>
    );

  return (
    <div className="w-full">
      {/* Header */}
      <MotionDiv
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-10"
      >
        <p
          className="text-xs uppercase tracking-widest mb-2"
          style={{ color: "#8C8579" }}
        >
          Cryptographic vault
        </p>
        <h1
          className="font-serif text-4xl mb-2"
          style={{ color: "#2D2926", fontWeight: 300 }}
        >
          The Vault
        </h1>
        <p className="text-sm" style={{ color: "#8C8579" }}>
          Store what matters most — documents, memories, and messages — sealed
          until the right moment.
        </p>
      </MotionDiv>

      {/* Vault seal banner */}
      <MotionDiv
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl p-5 mb-8 flex items-center gap-4"
        style={{
          background: "linear-gradient(135deg, #1C2830, #263040)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
        }}
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: "rgba(201,169,110,0.15)" }}
        >
          <Shield className="w-5 h-5" style={{ color: "#C9A96E" }} />
        </div>
        <div>
          <p className="text-sm font-medium" style={{ color: "#F5F0E8" }}>
            End-to-end encrypted vault
          </p>
          <p className="text-xs" style={{ color: "#7B8C99" }}>
            All items are cryptographically sealed. {items.length} item
            {items.length !== 1 ? "s" : ""} stored.
          </p>
        </div>
      </MotionDiv>

      {/* Category filter */}
      {items.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-7">
          <button
            onClick={() => setFilterCat("all")}
            className="px-3.5 py-1.5 rounded-full text-xs font-medium transition-all"
            style={{
              backgroundColor: filterCat === "all" ? "#7B9E87" : "#F0EBE3",
              color: filterCat === "all" ? "white" : "#8C8579",
            }}
          >
            All ({items.length})
          </button>
          {CATEGORIES.filter((c) =>
            items.some((i) => (i.category || "document") === c.value),
          ).map((c) => (
            <button
              key={c.value}
              onClick={() => setFilterCat(c.value)}
              className="px-3.5 py-1.5 rounded-full text-xs font-medium transition-all"
              style={{
                backgroundColor: filterCat === c.value ? c.color : "#F0EBE3",
                color: filterCat === c.value ? "white" : "#8C8579",
              }}
            >
              {c.label} (
              {
                items.filter((i) => (i.category || "document") === c.value)
                  .length
              }
              )
            </button>
          ))}
        </div>
      )}

      {/* Items grid */}
      <div className="grid md:grid-cols-2 gap-4 mb-8">
        <AnimatePresence>
          {filtered.map((item, i) => {
            const cat = getCat(item.category || "document");
            const CatIcon = cat.icon;
            return (
              <MotionDiv
                key={item._id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ delay: i * 0.04 }}
                className="rounded-2xl p-6 relative overflow-hidden group"
                style={{
                  backgroundColor: "white",
                  border: "1px solid #E8E3DC",
                  boxShadow: "0 2px 16px rgba(0,0,0,0.04)",
                }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${cat.color}15` }}
                  >
                    <CatIcon className="w-4 h-4" style={{ color: cat.color }} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Lock className="w-3 h-3" style={{ color: "#C4BEB6" }} />
                    <button
                      onClick={() => handleDelete(item._id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                      style={{ color: "#C4BEB6" }}
                      title="Delete Asset"
                    >
                      <Trash2 className="w-3.5 h-3.5 hover:text-red-500 transition-colors" />
                    </button>
                  </div>
                </div>

                <h3
                  className="font-medium mb-1 text-sm pr-6 truncate"
                  style={{ color: "#2D2926" }}
                >
                  {item.file_name}
                </h3>
                {item.description && (
                  <p
                    className="text-xs mb-2 line-clamp-2"
                    style={{ color: "#8C8579" }}
                  >
                    {item.description}
                  </p>
                )}

                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <span className="text-[10px] px-2 py-1 rounded-md bg-gray-50 text-gray-500 border border-gray-100">
                    Threshold: {item.threshold}/{item.total_shards}
                  </span>
                  {item.unlockCondition && (
                    <span
                      className="text-[10px] px-2 py-1 rounded-md"
                      style={{
                        backgroundColor: "#F5F1EC",
                        color: "#8C8579",
                        fontStyle: "italic",
                      }}
                    >
                      🔓 {item.unlockCondition}
                    </span>
                  )}
                </div>
              </MotionDiv>
            );
          })}
        </AnimatePresence>
      </div>

      {items.length === 0 && !showForm && (
        <div
          className="mb-10 text-center py-16 border-2 border-dashed rounded-3xl"
          style={{ borderColor: "#E8E3DC" }}
        >
          <Lock
            className="w-10 h-10 mx-auto mb-4"
            style={{ color: "#C4BEB6" }}
          />
          <p className="font-serif text-xl mb-2" style={{ color: "#8C8579" }}>
            Your vault is empty
          </p>
          <p className="text-sm" style={{ color: "#A8A09A" }}>
            Upload documents, photos, and messages for your loved ones.
          </p>
        </div>
      )}

      {/* Add form */}
      <AnimatePresence>
        {showForm && (
          <MotionDiv
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-3xl p-8 mb-6"
            style={{
              backgroundColor: "white",
              border: "1px solid #E8E3DC",
              boxShadow: "0 10px 40px rgba(0,0,0,0.06)",
            }}
          >
            <h3
              className="font-serif text-2xl mb-6"
              style={{ color: "#2D2926" }}
            >
              Add to vault
            </h3>

            <div className="grid md:grid-cols-2 gap-x-6">
              <div className="mb-4">
                <label
                  className="block text-xs font-medium mb-1.5"
                  style={{ color: "#4A453F" }}
                >
                  Asset Title
                </label>
                <input
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all focus:ring-2 focus:ring-[#7B9E87]/30"
                  style={{
                    backgroundColor: "#F5F1EC",
                    border: "1px solid #E8E3DC",
                    color: "#2D2926",
                  }}
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Last Will and Testament"
                />
              </div>
              <div className="mb-4">
                <label
                  className="block text-xs font-medium mb-1.5"
                  style={{ color: "#4A453F" }}
                >
                  Category
                </label>
                <select
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all focus:ring-2 focus:ring-[#7B9E87]/30"
                  style={{
                    backgroundColor: "#F5F1EC",
                    border: "1px solid #E8E3DC",
                    color: "#2D2926",
                  }}
                  value={form.category}
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value })
                  }
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mb-4">
              <label
                className="block text-xs font-medium mb-1.5"
                style={{ color: "#4A453F" }}
              >
                Description (Optional)
              </label>
              <textarea
                className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all focus:ring-2 focus:ring-[#7B9E87]/30"
                style={{
                  backgroundColor: "#F5F1EC",
                  border: "1px solid #E8E3DC",
                  color: "#2D2926",
                  minHeight: "80px",
                }}
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                placeholder="Brief description of this item…"
              />
            </div>

            {/* Shamir Customization Settings */}
            <div
              className="grid md:grid-cols-2 gap-x-6 mb-4 p-4 rounded-xl"
              style={{
                backgroundColor: "#FDFCFB",
                border: "1px solid #E8E3DC",
              }}
            >
              <div>
                <label
                  className="block text-xs font-medium mb-1.5"
                  style={{ color: "#4A453F" }}
                >
                  Total Shards (n)
                </label>
                <input
                  type="number"
                  min="2"
                  max={heirCount + 1}
                  className="w-full px-4 py-2.5 rounded-lg text-sm outline-none border"
                  style={{ backgroundColor: "white", borderColor: "#E8E3DC" }}
                  value={nTotal}
                  onChange={(e) => setNTotal(Number(e.target.value))}
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  Total fragments to generate.
                </p>
              </div>
              <div>
                <label
                  className="block text-xs font-medium mb-1.5"
                  style={{ color: "#4A453F" }}
                >
                  Required Shards (k)
                </label>
                <input
                  type="number"
                  min="2"
                  max={nTotal}
                  className="w-full px-4 py-2.5 rounded-lg text-sm outline-none border"
                  style={{ backgroundColor: "white", borderColor: "#E8E3DC" }}
                  value={kThreshold}
                  onChange={(e) => setKThreshold(Number(e.target.value))}
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  Minimum fragments needed to unlock.
                </p>
              </div>
            </div>

            <div className="mb-4">
              <label
                className="block text-xs font-medium mb-1.5"
                style={{ color: "#4A453F" }}
              >
                Reveal condition (Optional)
              </label>
              <input
                className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all focus:ring-2 focus:ring-[#7B9E87]/30"
                style={{
                  backgroundColor: "#F5F1EC",
                  border: "1px solid #E8E3DC",
                  color: "#2D2926",
                }}
                value={form.unlock_condition}
                onChange={(e) =>
                  setForm({ ...form, unlock_condition: e.target.value })
                }
                placeholder="e.g. Open only after I have passed"
              />
            </div>

            {/* File upload */}
            <div className="mb-6">
              <label
                className="block text-xs font-medium mb-2"
                style={{ color: "#4A453F" }}
              >
                Target File
              </label>
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all hover:border-[#7B9E87] bg-gray-50/50"
                style={{ borderColor: file ? "#7B9E87" : "#D4CFC8" }}
              >
                <Upload
                  className="w-8 h-8 mx-auto mb-3"
                  style={{ color: file ? "#7B9E87" : "#C4BEB6" }}
                />
                <p
                  className="text-sm font-medium"
                  style={{ color: file ? "#4A7A5A" : "#8C8579" }}
                >
                  {file ? file.name : "Click to attach secure file"}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {file
                    ? `${(file.size / 1024).toFixed(1)} KB`
                    : "Any file format supported"}
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </div>
            </div>

            {statusMsg && (
              <div
                className="mb-6 p-3 rounded-xl text-xs font-medium text-center"
                style={{
                  backgroundColor: statusMsg.includes("Error")
                    ? "#FEF2F2"
                    : "#F0F5F2",
                  color: statusMsg.includes("Error") ? "#991B1B" : "#4A7A5A",
                }}
              >
                {statusMsg}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleSave}
                disabled={uploading}
                className="flex items-center gap-2 px-6 py-3 rounded-xl text-white text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-70"
                style={{
                  background: "linear-gradient(135deg, #7B9E87, #4A7A5A)",
                  boxShadow: "0 4px 16px rgba(123,158,135,0.3)",
                }}
              >
                {uploading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                {uploading ? "Encrypting & Storing..." : "Encrypt & Store"}
              </button>
              <button
                onClick={() => {
                  setShowForm(false);
                  setForm(EMPTY);
                  setFile(null);
                  setStatusMsg("");
                }}
                className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm transition-colors hover:bg-gray-100"
                style={{ backgroundColor: "#F5F1EC", color: "#8C8579" }}
              >
                <X className="w-4 h-4" /> Cancel
              </button>
            </div>
          </MotionDiv>
        )}
      </AnimatePresence>

      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2.5 px-7 py-3.5 rounded-xl text-white text-sm font-medium transition-all hover:-translate-y-0.5"
          style={{
            background: "linear-gradient(135deg, #7B9E87, #4A7A5A)",
            boxShadow: "0 8px 20px rgba(123,158,135,0.3)",
          }}
        >
          <Plus className="w-4 h-4" /> Add to Vault
        </button>
      )}
    </div>
  );
};

export default VaultUpload;
