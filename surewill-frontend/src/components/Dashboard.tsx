import React, { useState, useEffect } from "react";
import {
  Shield,
  Users,
  Lock,
  ChevronRight,
  CheckCircle,
  Circle,
  Sparkles,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import VaultUpload from "./VaultUpload";
import BeneficiaryList from "./BeneficiaryList";

const MotionDiv = motion.div;

export const Dashboard = ({ logout }: { logout: () => void }) => {
  const [activeTab, setActiveTab] = useState("overview");
  const [menuOpen, setMenuOpen] = useState(false);

  // Data states for the Dashboard Progress
  const [heirCount, setHeirCount] = useState(0);
  const [assetCount, setAssetCount] = useState(0);
  const [assetRefresh, setAssetRefresh] = useState(0);
  const [estatePreference, setEstatePreference] = useState("standard");
  const [username, setUsername] = useState("");
  const [dmsThreshold, setDmsThreshold] = useState(60);
  const [gracePeriod, setGracePeriod] = useState(14);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState({ type: "", msg: "" });
  // This is for showing the user their current settings
  const [savedThreshold, setSavedThreshold] = useState(60);
  const [savedGracePeriod, setSavedGracePeriod] = useState(14);

  const fetchStats = async () => {
    // IDOR Patch
    // Gets the token from the session storage
    try {
      const token = sessionStorage.getItem("surewill_jwt");
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      };

      const [benRes, assetRes, userRes] = await Promise.all([
        fetch(`/api/beneficiaries`, { headers }),
        fetch(`/api/vault/list`, { headers }),
        fetch(`/api/user/profile`, { headers }),
      ]);
      const bens = await benRes.json();
      const assets = await assetRes.json();

      setHeirCount(bens.length || 0);
      setAssetCount(assets.length || 0);

      if (userRes.ok) {
        const userData = await userRes.json();
        setEstatePreference(userData.estatePreference || "standard");
        setUsername(userData.username);

        if (userData.dmsThreshold) {
          setDmsThreshold(userData.dmsThreshold);
          setSavedThreshold(userData.dmsThreshold);
        }
        if (userData.gracePeriod) {
          setGracePeriod(userData.gracePeriod);
          setSavedGracePeriod(userData.gracePeriod);
        }
      } else {
        console.error("Backend fetch failed.", userRes.status);
      }
    } catch (err) {
      console.error("Failed to sync stats", err);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [assetRefresh]);

  const handleSaveDMS = async () => {
    setIsSaving(true);
    setSaveStatus({ type: "info", msg: "Updating security protocol..." });

    try {
      const token = sessionStorage.getItem("surewill_jwt");
      const res = await fetch("/api/user/dms-settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          dms_threshold: dmsThreshold,
          dms_grace_period: gracePeriod,
        }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to update settings.");

      setSaveStatus({
        type: "success",
        msg: "Check-in and Confirmation window updated successfully.",
      });
      setSavedThreshold(dmsThreshold);
      setSavedGracePeriod(gracePeriod);
      setTimeout(() => setSaveStatus({ type: "", msg: "" }), 3000);
    } catch (err: any) {
      setSaveStatus({
        type: "error",
        msg: err.message || "An error occurred.",
      });
    }

    setIsSaving(false);
  };

  const checklist = [
    { label: "Account secured with MFA", done: true, tab: "overview" },

    {
      label: "Heirs registered in trust",
      done: heirCount > 0,
      tab: "beneficiaries",
    },
    { label: "Assets encrypted & vaulted", done: assetCount > 0, tab: "vault" },

    ...(estatePreference !== "sharia"
      ? [
          {
            label: "Shards distributed to heirs",
            done: assetCount > 0 && heirCount > 0,
            tab: "beneficiaries",
          },
        ]
      : [
          {
            label: "Generate & Vault Faraid Will",
            done: assetCount > 0 && heirCount > 0,
            tab: "beneficiaries",
          },
        ]),
  ];

  const completedSteps = checklist.filter((c) => c.done).length;
  const progressPct = Math.round((completedSteps / checklist.length) * 100);

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const navLinks = [
    { name: "Overview", tab: "overview", icon: Shield },
    { name: "My Vault", tab: "vault", icon: Lock },
    { name: "Beneficiaries", tab: "beneficiaries", icon: Users },
  ];

  const cards = [
    {
      title: "My Vault",
      desc: `${assetCount} encrypted items stored`,
      icon: Lock,
      tab: "vault",
      color: "#7B9E87",
    },
    {
      title: "Beneficiaries",
      desc: `${heirCount} registered heirs`,
      icon: Users,
      tab: "beneficiaries",
      color: "#C9A96E",
    },
  ];

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "#FAF7F2", fontFamily: "'Inter', sans-serif" }}
    >
      {/* Top Navigation Bar */}
      <header
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
        style={{
          backgroundColor: "rgba(250,247,242,0.92)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid #E8E3DC",
        }}
      >
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div
            className="flex items-center gap-2.5 cursor-pointer"
            onClick={() => setActiveTab("overview")}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, #7B9E87, #4A7A5A)",
              }}
            >
              <Shield className="w-4 h-4 text-white" />
            </div>
            <span
              className="font-serif text-xl"
              style={{ color: "#2D2926", letterSpacing: "0.02em" }}
            >
              SureWill
            </span>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map(({ name, tab }) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`text-sm font-medium transition-colors hover:text-[#7B9E87] ${activeTab === tab ? "text-[#4A7A5A]" : "text-[#8C8579]"}`}
              >
                {name}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-4">
            <button
              onClick={logout}
              className="hidden md:flex items-center gap-1.5 text-sm transition-colors text-[#8C8579] hover:text-[#4A7A5A]"
            >
              <LogOut className="w-4 h-4" /> Lock Vault
            </button>
            <button
              className="md:hidden text-[#4A7A5A]"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {menuOpen && (
            <MotionDiv
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="md:hidden overflow-hidden border-t border-[#E8E3DC] bg-[#FAF7F2]"
            >
              <div className="px-6 py-4 space-y-3">
                {navLinks.map(({ name, tab, icon: Icon }) => (
                  <button
                    key={tab}
                    onClick={() => {
                      setActiveTab(tab);
                      setMenuOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 py-2 text-sm font-medium ${activeTab === tab ? "text-[#4A7A5A]" : "text-[#8C8579]"}`}
                  >
                    <Icon className="w-4 h-4" /> {name}
                  </button>
                ))}
                <button
                  onClick={logout}
                  className="flex w-full items-center gap-3 py-2 text-sm text-[#8C8579]"
                >
                  <LogOut className="w-4 h-4" /> Lock Vault
                </button>
              </div>
            </MotionDiv>
          )}
        </AnimatePresence>
      </header>

      <main className="pt-24 pb-12 px-6 max-w-5xl mx-auto">
        {activeTab === "overview" && (
          <MotionDiv
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="mb-12">
              <p className="text-sm mb-2 uppercase tracking-widest text-[#8C8579]">
                Your estate portal
              </p>
              <h1 className="font-serif text-4xl md:text-5xl mb-3 text-[#2D2926] font-light">
                {greeting}, {username}.
              </h1>
              <p className="text-[#8C8579] text-lg">
                Your wishes, preserved with care. Start by completing the vault
                checklist.
              </p>
            </div>

            {/* User Progress card that updates*/}
            <div
              className="rounded-3xl p-8 mb-10 bg-white border border-[#E8E3DC]"
              style={{ boxShadow: "0 10px 40px rgba(0,0,0,0.04)" }}
            >
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="font-serif text-2xl mb-1 text-[#2D2926]">
                    Vault Progress
                  </h2>
                  <p className="text-sm text-[#8C8579]">
                    {completedSteps} of {checklist.length} steps complete
                  </p>
                </div>
                <div className="text-right">
                  <span className="font-serif text-3xl text-[#7B9E87]">
                    {progressPct}%
                  </span>
                </div>
              </div>

              <div className="w-full h-2 rounded-full mb-6 bg-[#EDE8E1] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${progressPct}%`,
                    background: "linear-gradient(90deg, #7B9E87, #4A7A5A)",
                  }}
                />
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                {checklist.map((item, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveTab(item.tab)}
                    className="flex items-center gap-3 py-2 px-3 rounded-xl transition-all hover:bg-stone-50 group text-left"
                  >
                    {item.done ? (
                      <CheckCircle className="w-4 h-4 flex-shrink-0 text-[#7B9E87]" />
                    ) : (
                      <Circle className="w-4 h-4 flex-shrink-0 text-[#C4BEB6]" />
                    )}
                    <span
                      className={`text-sm ${item.done ? "text-[#4A7A5A]" : "text-[#8C8579]"}`}
                    >
                      {item.label}
                    </span>
                    {!item.done && (
                      <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-[#8C8579]" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Nav */}
            <div className="grid md:grid-cols-2 gap-5 mb-10">
              {cards.map((card, i) => (
                <button
                  key={card.tab}
                  onClick={() => setActiveTab(card.tab)}
                  className="group text-left block rounded-3xl p-7 transition-all duration-300 hover:-translate-y-1 bg-white border border-[#E8E3DC]"
                  style={{ boxShadow: "0 10px 40px rgba(0,0,0,0.04)" }}
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-5 bg-[#F0F5F2]">
                    <card.icon
                      className="w-5 h-5"
                      style={{ color: card.color }}
                    />
                  </div>
                  <h3 className="font-medium mb-1 text-[#2D2926]">
                    {card.title}
                  </h3>
                  <p className="text-sm text-[#8C8579]">{card.desc}</p>
                  <div className="flex items-center gap-1 mt-4 text-xs font-medium transition-all group-hover:gap-2 text-[#7B9E87]">
                    Open <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </button>
              ))}
            </div>

            {/*Dead Man's Switch customizer so user can set it manually*/}
            <div
              className="rounded-3xl p-8 bg-white border border-[#E8E3DC] mb-10"
              style={{ boxShadow: "0 10px 40px rgba(0,0,0,0.04)" }}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-[#F0F5F2] flex items-center justify-center text-[#4A7A5A]">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-[#2D2926]">
                    Heartbeat Monitor
                  </h3>
                  <p className="text-xs text-[#8C8579]">
                    Customize your Check-in and Vault Release timers. Whether
                    you are an avid traveller or prefer to stay at the comfort
                    of your own home. You are accommodated.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium mb-2 text-[#4A453F]">
                    Check-in Scheduling
                    <span className="px-2 py-0.5 rounded-md bg-[#F0F5F2] text-[#4A7A5A] text-[10px] font-bold tracking-wide">
                      Your Current Active: {savedThreshold} DAYS
                    </span>
                  </label>
                  <p className="text-[10px] text-[#8C8579] mb-3 leading-relaxed">
                    This is how long the system will be waiting for you without
                    seeing you log in before allowing vault access to your loved
                    ones.
                  </p>
                  <select
                    value={dmsThreshold}
                    onChange={(e) => setDmsThreshold(Number(e.target.value))}
                    className="w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-all border border-[#E8E3DC] bg-[#F5F1EC] text-[#2D2926] focus:ring-2 focus:ring-[#7B9E87]/30"
                  >
                    <option value={7}>7 Days (Weekly Check-in)</option>
                    <option value={14}>14 Days (Bi-weekly Check-in)</option>
                    <option value={30}>30 Days (Standard Monitoring)</option>
                    <option value={60}>60 Days (Relaxed - Recommended)</option>
                    <option value={90}>
                      90 Days (Extended or Vacation Mode)
                    </option>
                    <option value={180}>180 Days (Half Year)</option>
                    <option value={365}>365 Days (Annual Check-in)</option>
                  </select>
                </div>

                {/* Grace Period Selection */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium mb-2 text-[#4A453F]">
                    Confirmation Window
                    <span className="px-2 py-0.5 rounded-md bg-[#F0F5F2] text-[#4A7A5A] text-[10px] font-bold tracking-wide">
                      Your Current Active: {savedGracePeriod} DAYS
                    </span>
                  </label>
                  <p className="text-[10px] text-[#8C8579] mb-3 leading-relaxed">
                    If we have not heard from you in a long time, this is how
                    long we will wait before initiating the asset release to
                    your loved ones.
                  </p>
                  <select
                    value={gracePeriod}
                    onChange={(e) => setGracePeriod(Number(e.target.value))}
                    className="w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-all border border-[#E8E3DC] bg-[#F5F1EC] text-[#2D2926] focus:ring-2 focus:ring-[#7B9E87]/30"
                  >
                    <option value={3}>3 Days (Strict Minimum)</option>
                    <option value={7}>7 Days (Standard 1 Week)</option>
                    <option value={14}>
                      14 Days (Extended Time - Recommended)
                    </option>
                    <option value={30}>30 Days (Maximum Flexibility)</option>
                  </select>
                </div>
              </div>

              {/* Status Feedback */}
              {saveStatus.msg && (
                <div
                  className={`mb-4 p-3 rounded-xl text-xs font-medium flex items-center gap-2 border ${saveStatus.type === "error" ? "bg-red-50 text-red-600 border-red-100" : saveStatus.type === "success" ? "bg-[#F0F5F2] text-[#4A7A5A] border-[#B8D4BF]" : "bg-blue-50 text-blue-700 border-blue-100"}`}
                >
                  <CheckCircle className="w-4 h-4" /> {saveStatus.msg}
                </div>
              )}

              <button
                onClick={handleSaveDMS}
                disabled={isSaving}
                className="px-6 py-3 rounded-xl text-white text-sm font-medium transition-all hover:opacity-90 disabled:opacity-70"
                style={{
                  background: "linear-gradient(135deg, #7B9E87, #4A7A5A)",
                }}
              >
                {isSaving ? "Checking Settings..." : "Save"}
              </button>
            </div>

            {/* Gentle reminder banner */}
            <div
              className="rounded-2xl p-6 flex items-start gap-4"
              style={{
                background: "linear-gradient(135deg, #F4F9F6, #EDF5F0)",
                border: "1px solid #D4E8DC",
              }}
            >
              <Sparkles className="w-5 h-5 mt-0.5 flex-shrink-0 text-[#7B9E87]" />
              <div>
                <p className="text-sm font-medium mb-1 text-[#2D2926]">
                  A gift of peace to those you love
                </p>
                <p className="text-sm text-[#8C8579] leading-relaxed">
                  Completing your vault is one of the most loving things you can
                  do. Your family will thank you for the clarity and care you
                  leave behind.
                </p>
              </div>
            </div>
          </MotionDiv>
        )}

        {/* VIEW: VAULT UPLOAD */}
        {activeTab === "vault" && (
          <MotionDiv
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <VaultUpload
              heirCount={heirCount}
              onAssetUploaded={() => {
                setAssetRefresh((prev) => prev + 1);
                fetchStats();
              }}
            />
          </MotionDiv>
        )}

        {/* VIEW: BENEFICIARIES */}
        {activeTab === "beneficiaries" && (
          <MotionDiv
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <BeneficiaryList
              onBeneficiaryAdded={fetchStats}
              assetRefresh={assetRefresh}
            />
          </MotionDiv>
        )}
      </main>
    </div>
  );
};
