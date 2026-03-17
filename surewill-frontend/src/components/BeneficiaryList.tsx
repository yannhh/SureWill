import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Trash2,
  Users,
  Check,
  X,
  Shield,
  Key,
  AlertCircle,
} from "lucide-react";
import { ShariaWillGenerator } from "./ShariaWillGenerator";

const MotionDiv = motion.div;

const relationshipColors: Record<string, any> = {
  // The standard relationships
  spouse: { bg: "#FDF3F3", text: "#C07070", border: "#F5C6C6" },
  child: { bg: "#F0F5F2", text: "#4A7A5A", border: "#B8D4BF" },
  parent: { bg: "#FDF6ED", text: "#A07030", border: "#E8D5B0" },
  sibling: { bg: "#F0F0F8", text: "#5050A0", border: "#C0C0E0" },
  friend: { bg: "#F5F0F8", text: "#805090", border: "#D0B0E0" },
  charity: { bg: "#F5F5F0", text: "#707060", border: "#D0D0B0" },
  // The sharia relationships
  husband: { bg: "#FDF3F3", text: "#C07070", border: "#F5C6C6" },
  wife: { bg: "#FDF3F3", text: "#C07070", border: "#F5C6C6" },
  son: { bg: "#F0F5F2", text: "#4A7A5A", border: "#B8D4BF" },
  daughter: { bg: "#F0F5F2", text: "#4A7A5A", border: "#B8D4BF" },
  father: { bg: "#FDF6ED", text: "#A07030", border: "#E8D5B0" },
  mother: { bg: "#FDF6ED", text: "#A07030", border: "#E8D5B0" },
  brother: { bg: "#F0F0F8", text: "#5050A0", border: "#C0C0E0" },
  sister: { bg: "#F0F0F8", text: "#5050A0", border: "#C0C0E0" },
  cousin: { bg: "#F5F5F5", text: "#707070", border: "#D0D0D0" },
};

const STANDARD_RELATIONSHIPS = [
  "spouse",
  "child",
  "parent",
  "sibling",
  "friend",
  "charity",
];

const SHARIA_RELATIONSHIPS = [
  "husband",
  "wife",
  "son",
  "daughter",
  "father",
  "mother",
  "brother",
  "sister",
  "cousin",
];

const EMPTY = (pref: string) => ({
  full_name: "",
  relationship: pref === "sharia" ? "son" : "child",
  email: "",
  phone: "",
});

const BeneficiaryList: React.FC<{
  onBeneficiaryAdded: () => void;
  assetRefresh: number;
}> = ({ onBeneficiaryAdded, assetRefresh }) => {
  const [assets, setAssets] = useState<any[]>([]);
  const [beneficiaries, setBeneficiaries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [estatePreferences, setEstatePreferences] = useState("standard");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY("standard"));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  const [selectedAsset, setSelectedAsset] = useState("");
  const [selectedBeneficiary, setSelectedBeneficiary] = useState("");
  const [assignStatus, setAssignStatus] = useState("");
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    fetchData();
  }, [assetRefresh]);

  const fetchData = async () => {
    try {
      // IDOR Patch
      const token = sessionStorage.getItem("surewill_jwt");
      const headers = { Authorization: `Bearer ${token}` };

      const [assetRes, benRes, userRes] = await Promise.all([
        fetch(`/api/vault/list`, { headers }),
        fetch(`/api/beneficiaries`, { headers }),
        fetch(`/api/user/profile`, { headers }),
      ]);

      setAssets(await assetRes.json());
      setBeneficiaries(await benRes.json());

      if (userRes.ok) {
        const userData = await userRes.json();
        console.log("User Data:", userData); // Having trouble with the sharia setting the form ui changes
        const pref = userData.estatePreference || "standard";
        setEstatePreferences(pref);
        setForm(EMPTY(pref));
      } else {
        console.error("Backend fetch failed.", userRes.status);
      }

      setLoading(false);
    } catch (err) {
      console.error("Failed to load data for dropdowns");
      setLoading(false);
    }
  };

  const handleSave = async () => {
    //Form Validation so the user can't just put random stuff in
    if (!form.full_name.trim() || !form.email.trim() || !form.phone.trim()) {
      setStatus("Please fill in all fields.");
      return; //Stops function from working further
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(form.email)) {
      setStatus("Please enter a valid email address.");
      return;
    }

    const phoneRegex = /^[\d\+\-\s\(\)]{7,20}$/;
    if (!phoneRegex.test(form.phone)) {
      setStatus("Please enter a valid phone number.");
      return;
    }

    setSaving(true);
    setStatus("");

    try {
      // IDOR Patch
      const token = sessionStorage.getItem("surewill_jwt");

      const res = await fetch("/api/beneficiaries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fullName: form.full_name,
          email: form.email,
          phone: form.phone,
          relationship: form.relationship,
        }),
      });
      const data = await res.json();

      if (res.ok) {
        setStatus("Beneficiary successfully registered.");
        fetchData();
        onBeneficiaryAdded();
        setShowForm(false);
        setForm(EMPTY(estatePreferences));
        setTimeout(() => setStatus(""), 3000);
      } else {
        setStatus(data.error || "Failed to register beneficiary.");
      }
    } catch (err) {
      setStatus("Server error during registration.");
    }
    setSaving(false);
  };

  const handleAssignAsset = async () => {
    if (!selectedAsset || !selectedBeneficiary) {
      return setAssignStatus("Please select both an asset and a beneficiary.");
    }

    setAssigning(true);
    setAssignStatus("Assigning cryptographic shard...");

    try {
      // IDOR Patch
      const token = sessionStorage.getItem("surewill_jwt");

      const res = await fetch("/api/vault/access", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },

        body: JSON.stringify({
          assetId: selectedAsset,
          beneficiaryId: selectedBeneficiary,
        }),
      });
      const data = await res.json();

      if (res.ok) {
        setAssignStatus("Success! Cryptographic shard securely assigned.");
        fetchData();
        setSelectedAsset("");
        setSelectedBeneficiary("");
        setTimeout(() => setAssignStatus(""), 4000);
      } else {
        setAssignStatus(data.error || "Assignment failed.");
      }
    } catch (err) {
      setAssignStatus("Server error during assignment.");
    }
    setAssigning(false);
  };

  const handleDelete = async (benId: string) => {
    // Confirmation message to the user if they are deleting someone
    if (!window.confirm("Are you sure you want to delete this beneficiary?"))
      return;

    try {
      // IDOR Patch
      const token = sessionStorage.getItem("surewill_jwt");

      const res = await fetch(`/api/beneficiaries/${benId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        setStatus("Heir has been removed.");
        fetchData(); // Refreshing the list in the UI
        onBeneficiaryAdded(); // This will update the progress bar in the main dashboard screen of the user
        setTimeout(() => setStatus(""), 3000);
      } else {
        const data = await res.json();
        setStatus(data.error || "Failed to remove the heir.");
      }
    } catch (err) {
      console.error(err);
      setStatus("Server error while deleting");
    }
  };

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
          Your Loved Ones
        </p>
        <h1
          className="font-serif text-4xl mb-2"
          style={{ color: "#2D2926", fontWeight: 300 }}
        >
          Beneficiaries
        </h1>
        <p className="text-sm" style={{ color: "#8C8579" }}>
          The people who will carry your legacy forward and unlock your vault.
        </p>
      </MotionDiv>

      <AnimatePresence>
        {beneficiaries.map((b, i) => {
          const colors =
            relationshipColors[b.relationship?.toLowerCase()] ||
            relationshipColors.other;
          return (
            <MotionDiv
              key={b._id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ delay: i * 0.05 }}
              className="rounded-2xl p-6 mb-4 relative overflow-hidden group"
              style={{
                backgroundColor: "white",
                border: "1px solid #E8E3DC",
                boxShadow: "0 2px 16px rgba(0,0,0,0.04)",
              }}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{
                      backgroundColor: colors.bg,
                      border: `1px solid ${colors.border}`,
                    }}
                  >
                    <span
                      className="font-serif text-lg"
                      style={{ color: colors.text }}
                    >
                      {b.full_name?.[0]?.toUpperCase() || "?"}
                    </span>
                  </div>
                  <div>
                    <h3
                      className="font-medium mb-0.5"
                      style={{ color: "#2D2926" }}
                    >
                      {b.full_name}
                    </h3>
                    <span
                      className="text-[10px] px-2.5 py-0.5 rounded-full uppercase tracking-wider font-semibold"
                      style={{
                        backgroundColor: colors.bg,
                        color: colors.text,
                        border: `1px solid ${colors.border}`,
                      }}
                    >
                      {b.relationship}
                    </span>
                    {b.email && (
                      <p
                        className="text-xs mt-1.5"
                        style={{ color: "#8C8579" }}
                      >
                        {b.email}
                      </p>
                    )}
                    {b.phone_number && (
                      <p
                        className="text-xs mt-0.5"
                        style={{ color: "#8C8579" }}
                      >
                        MFA: {b.phone_number}
                      </p>
                    )}
                    {b.assigned_assets && b.assigned_assets.length > 0 && (
                      <div
                        className="mt-3 flex items-center gap-1.5 text-xs font-medium"
                        style={{ color: "#7B9E87" }}
                      >
                        <Key className="w-3.5 h-3.5" /> Holds{" "}
                        {b.assigned_assets.length} Cryptographic Shard
                        {b.assigned_assets.length > 1 ? "s" : ""}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDelete(b._id)}
                    className="p-2 rounded-lg transition-colors opacity-0 group-hover:opacity-100 hover:bg-red-50"
                    style={{ color: "#C4BEB6" }}
                  >
                    <Trash2 className="w-4 h-4 hover:text-red-500 transition-colors" />
                  </button>
                </div>
              </div>
            </MotionDiv>
          );
        })}
      </AnimatePresence>

      {beneficiaries.length === 0 && !showForm && (
        <div
          className="mb-10 text-center py-16 border-2 border-dashed rounded-3xl"
          style={{ borderColor: "#E8E3DC" }}
        >
          <Users
            className="w-10 h-10 mx-auto mb-4"
            style={{ color: "#C4BEB6" }}
          />
          <p className="font-serif text-xl mb-2" style={{ color: "#8C8579" }}>
            No heirs registered
          </p>
          <p className="text-sm" style={{ color: "#A8A09A" }}>
            Add the people closest to your heart to grant them vault access.
          </p>
        </div>
      )}

      {status && !showForm && (
        <div
          className="mb-4 p-3 rounded-xl text-xs font-medium text-center"
          style={{
            backgroundColor: "#F0F5F2",
            color: "#4A7A5A",
            border: "1px solid #B8D4BF",
          }}
        >
          {status}
        </div>
      )}

      <AnimatePresence>
        {showForm && (
          <MotionDiv
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-3xl p-8 mb-5"
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
              Register Heir
            </h3>
            <div className="grid md:grid-cols-2 gap-x-6">
              <div className="mb-4">
                <label
                  className="block text-xs font-medium mb-1.5"
                  style={{ color: "#4A453F" }}
                >
                  Full name
                </label>
                <input
                  type="text"
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all focus:ring-2 focus:ring-[#7B9E87]/30"
                  style={{
                    backgroundColor: "#F5F1EC",
                    border: "1px solid #E8E3DC",
                    color: "#2D2926",
                  }}
                  value={form.full_name}
                  onChange={(e) =>
                    setForm({ ...form, full_name: e.target.value })
                  }
                  placeholder="e.g. Emma Grace Smith"
                />
              </div>
              <div className="mb-4">
                <label
                  className="block text-xs font-medium mb-1.5"
                  style={{ color: "#4A453F" }}
                >
                  Relationship
                </label>
                <select
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all focus:ring-2 focus:ring-[#7B9E87]/30"
                  style={{
                    backgroundColor: "#F5F1EC",
                    border: "1px solid #E8E3DC",
                    color: "#2D2926",
                  }}
                  value={form.relationship}
                  onChange={(e) =>
                    setForm({ ...form, relationship: e.target.value })
                  }
                >
                  {/* Changes the UI based on the type of user account */}
                  {(estatePreferences === "sharia"
                    ? SHARIA_RELATIONSHIPS
                    : STANDARD_RELATIONSHIPS
                  ).map((r) => (
                    <option key={r} value={r}>
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-x-6 mb-6">
              <div className="mb-4 md:mb-0">
                <label
                  className="block text-xs font-medium mb-1.5"
                  style={{ color: "#4A453F" }}
                >
                  Email Address
                </label>
                <input
                  type="email"
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all focus:ring-2 focus:ring-[#7B9E87]/30"
                  style={{
                    backgroundColor: "#F5F1EC",
                    border: "1px solid #E8E3DC",
                    color: "#2D2926",
                  }}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="emma@example.com"
                />
              </div>
              <div>
                {/*Phone input field*/}
                <label
                  className="block text-xs font-medium mb-1.5"
                  style={{ color: "#4A453F" }}
                >
                  Mobile Phone Number
                </label>
                <input
                  type="tel"
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all focus:ring-2 focus:ring-[#7B9E87]/30"
                  style={{
                    backgroundColor: "#F5F1EC",
                    border: "1px solid #E8E3DC",
                    color: "#2D2926",
                  }}
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+1 (555) 000-0000"
                />
              </div>
            </div>

            {/* Status error for UI */}
            {status && (
              <div
                className={`mb-6 p-3 rounded-xl text-xs font-medium flex items-start gap-2 border ${
                  status.includes("Error") || status.includes("fail")
                    ? "bg-[#FEF2F2] text-[#991B1B] border-[#FCA5A5]" // Red Error Styling
                    : "bg-[#F0F5F2] text-[#4A7A5A] border-[#B8D4BF]" // Green Success Styling
                }`}
              >
                {status.includes("Error") && (
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                )}
                <span>{status}</span>
              </div>
            )}

            <div className="flex gap-3 mt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-3 rounded-xl text-white text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-70"
                style={{
                  background: "linear-gradient(135deg, #7B9E87, #4A7A5A)",
                  boxShadow: "0 4px 16px rgba(123,158,135,0.3)",
                }}
              >
                {saving ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                {saving ? "Registering..." : "Register"}
              </button>
              <button
                onClick={() => {
                  setShowForm(false);
                  setForm(EMPTY(estatePreferences));
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
          onClick={() => {
            setShowForm(true);
            setForm(EMPTY(estatePreferences));
          }}
          className="mb-5 flex items-center gap-2.5 px-7 py-3.5 rounded-xl text-white text-sm font-medium transition-all hover:-translate-y-0.5"
          style={{
            background: "linear-gradient(135deg, #7B9E87, #4A7A5A)",
            boxShadow: "0 8px 20px rgba(123,158,135,0.3)",
          }}
        >
          <Plus className="w-4 h-4" /> Register New Heir
        </button>
      )}

      {beneficiaries.length > 0 && assets.length > 0 && (
        <MotionDiv
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-16 pt-10 border-t border-[#E8E3DC]"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#F0F5F2]">
              <Shield className="w-5 h-5 text-[#4A7A5A]" />
            </div>
            <div>
              <h2 className="font-serif text-2xl text-[#2D2926]">
                Distribute Assets
              </h2>
              <p className="text-sm text-[#8C8579]">
                Assign cryptographic shards to your registered heirs.
              </p>
            </div>
          </div>
          <div
            className="rounded-3xl p-8 bg-white border border-[#E8E3DC]"
            style={{ boxShadow: "0 10px 40px rgba(0,0,0,0.04)" }}
          >
            <div className="grid md:grid-cols-2 gap-6 mb-6">
              <div>
                <label
                  className="block text-xs font-medium mb-1.5"
                  style={{ color: "#4A453F" }}
                >
                  1. Select Vault Asset
                </label>
                <select
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all focus:ring-2 focus:ring-[#7B9E87]/30"
                  style={{
                    backgroundColor: "#F5F1EC",
                    border: "1px solid #E8E3DC",
                    color: "#2D2926",
                  }}
                  onChange={(e) => setSelectedAsset(e.target.value)}
                  value={selectedAsset}
                >
                  <option value="">-- Choose an Asset --</option>
                  {assets.map((a) => (
                    <option key={a._id} value={a._id}>
                      {a.file_name} (Needs {a.threshold} shards)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  className="block text-xs font-medium mb-1.5"
                  style={{ color: "#4A453F" }}
                >
                  2. Select Registered Heir
                </label>
                <select
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all focus:ring-2 focus:ring-[#7B9E87]/30"
                  style={{
                    backgroundColor: "#F5F1EC",
                    border: "1px solid #E8E3DC",
                    color: "#2D2926",
                  }}
                  onChange={(e) => setSelectedBeneficiary(e.target.value)}
                  value={selectedBeneficiary}
                >
                  <option value="">-- Choose an Heir --</option>
                  {beneficiaries.map((b) => (
                    <option key={b._id} value={b._id}>
                      {b.full_name} ({b.email})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {assignStatus && (
              <div
                className="mb-6 p-3 rounded-xl text-xs font-medium text-center"
                style={{
                  backgroundColor:
                    assignStatus.includes("Please") ||
                    assignStatus.includes("fail")
                      ? "#FEF2F2"
                      : "#F0F5F2",
                  color:
                    assignStatus.includes("Please") ||
                    assignStatus.includes("fail")
                      ? "#991B1B"
                      : "#4A7A5A",
                }}
              >
                {assignStatus}
              </div>
            )}
            <button
              onClick={handleAssignAsset}
              disabled={assigning}
              className="w-full flex justify-center items-center gap-2 py-3.5 rounded-xl text-white text-sm font-medium transition-all hover:opacity-90 disabled:opacity-70"
              style={{
                background: "linear-gradient(135deg, #2D2926, #4A453F)",
              }}
            >
              {assigning ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Key className="w-4 h-4" />
              )}
              {assigning ? "Processing Encryption..." : "Assign Shard to Heir"}
            </button>
          </div>
        </MotionDiv>
      )}
      {estatePreferences === "sharia" && beneficiaries.length > 0 && (
        <ShariaWillGenerator beneficiaries={beneficiaries} />
      )}
    </div>
  );
};

export default BeneficiaryList;
