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

export const Dashboard = ({
  userId,
  logout,
}: {
  userId: string;
  logout: () => void;
}) => {
  const [activeTab, setActiveTab] = useState("overview");
  const [menuOpen, setMenuOpen] = useState(false);

  // Data states for the Dashboard Progress
  const [heirCount, setHeirCount] = useState(0);
  const [assetCount, setAssetCount] = useState(0);
  const [assetRefresh, setAssetRefresh] = useState(0);
  const [estatePreference, setEstatePreference] = useState("standard");

  const fetchStats = async () => {
    try {
      const [benRes, assetRes, userRes] = await Promise.all([
        fetch(`/api/beneficiaries/${userId}`),
        fetch(`/api/vault/list/${userId}`),
        fetch(`/api/user/${userId}`),
      ]);
      const bens = await benRes.json();
      const assets = await assetRes.json();

      setHeirCount(bens.length || 0);
      setAssetCount(assets.length || 0);

      if (userRes.ok) {
        const userData = await userRes.json();
        setEstatePreference(userData.estatePreference || "standard");
      }
    } catch (err) {
      console.error("Failed to sync stats", err);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [userId, assetRefresh]);

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

      {/* Main Content Area */}
      <main className="pt-24 pb-12 px-6 max-w-5xl mx-auto">
        {/* VIEW: OVERVIEW (The Dashboard) */}
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
                {greeting}.
              </h1>
              <p className="text-[#8C8579] text-lg">
                Your wishes, preserved with care. Let's make sure everything is
                in order.
              </p>
            </div>

            {/* Progress Card */}
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

            {/* Navigation Cards */}
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
              userId={userId}
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
              userId={userId}
              onBeneficiaryAdded={fetchStats}
              assetRefresh={assetRefresh}
            />
          </MotionDiv>
        )}
      </main>
    </div>
  );
};
