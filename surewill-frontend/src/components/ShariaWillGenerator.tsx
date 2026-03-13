import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Scale, FileText, Download, CheckCircle } from "lucide-react";
import { jsPDF } from "jspdf";

export const ShariaWillGenerator = ({
  beneficiaries,
}: {
  beneficiaries: any[];
}) => {
  const [distribution, setDistribution] = useState<any[]>([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    calculateFaraid();
  }, [beneficiaries]);

  const calculateFaraid = () => {
    const roles = {
      husband: beneficiaries.filter((b) => b.relationship === "husband"),
      wife: beneficiaries.filter((b) => b.relationship === "wife"),
      son: beneficiaries.filter((b) => b.relationship === "son"),
      daughter: beneficiaries.filter((b) => b.relationship === "daughter"),
      father: beneficiaries.filter((b) => b.relationship === "father"),
      mother: beneficiaries.filter((b) => b.relationship === "mother"),
      brother: beneficiaries.filter((b) => b.relationship === "brother"),
      sister: beneficiaries.filter((b) => b.relationship === "sister"),
      cousin: beneficiaries.filter((b) => b.relationship === "cousin"),
    };

    const hasChildren = roles.son.length > 0 || roles.daughter.length > 0;
    const siblingCount = roles.brother.length + roles.sister.length;

    let shares = new Map<string, number>();
    let remainingEstate = 1.0; //100% of the estate

    // The math for spouses
    if (roles.husband.length > 0) {
      const share = hasChildren ? 0.25 : 0.5;
      shares.set(roles.husband[0]._id, share);
      remainingEstate -= share;
    }

    if (roles.wife.length > 0) {
      const totalWifeShare = hasChildren ? 0.125 : 0.25;
      const sharePerWife = totalWifeShare / roles.wife.length;
      roles.wife.forEach((w) => shares.set(w._id, sharePerWife));
      remainingEstate -= totalWifeShare;
    }

    // The math for parents (of the user)
    if (roles.father.length > 0) {
      // The Father gets 1/6th if there are children.
      // If the user has no children, he gets his 1/6 + the remainder which is Asabah
      const share = hasChildren ? 1 / 6 : 1 / 6;
      shares.set(roles.father[0]._id, share);
      remainingEstate -= share;
    }

    if (roles.mother.length > 0) {
      const share = hasChildren || siblingCount > 1 ? 1 / 6 : 1 / 3;
      shares.set(roles.mother[0]._id, share);
      remainingEstate -= share;
    }

    // The math for Daughters (if the user has no Sons)
    // If the user has sons, daughters become Asabah
    if (roles.son.length === 0 && roles.daughter.length > 0) {
      const totalDaughterShare = roles.daughter.length === 1 ? 0.5 : 2 / 3;
      // Ensures that the Awl rule is followed; not giving any more than what is available
      const actualShare = Math.min(totalDaughterShare, remainingEstate);
      const sharePerDaughter = actualShare / roles.daughter.length;
      roles.daughter.forEach((d) => shares.set(d._id, sharePerDaughter));
      remainingEstate -= actualShare;
    }

    // The remainder rule (Asabah)
    // The remaining estate of the User is starting to reach down the family or distant family
    if (remainingEstate > 0.001) {
      //0.001 to account for floating point math errors
      if (roles.son.length > 0) {
        // The first priority are Sons and Daughter which is 2:1 Ratio.
        const totalParts = roles.son.length * 2 + roles.daughter.length * 1;
        const valuePerPart = remainingEstate / totalParts;

        roles.son.forEach((s) => shares.set(s._id, valuePerPart * 2));
        roles.daughter.forEach((d) => shares.set(d._id, valuePerPart * 1));
        remainingEstate = 0;
      } else if (roles.father.length > 0) {
        // Second Priority is the Father gets the rest if the user has no Sons
        shares.set(
          roles.father[0]._id,
          (shares.get(roles.father[0]._id) || 0) + remainingEstate,
        );
        remainingEstate = 0;
      } else if (roles.brother.length > 0 || roles.sister.length > 0) {
        // Third priority are Siblings given 2:1 ratio, blocked by the Father/Son
        const totalParts = roles.brother.length * 2 + roles.sister.length * 1;
        const valuePerPart = remainingEstate / totalParts;

        roles.brother.forEach((b) => shares.set(b._id, valuePerPart * 2));
        roles.sister.forEach((s) => shares.set(s._id, valuePerPart * 1));
        remainingEstate = 0;
      } else if (roles.cousin.length > 0) {
        // Last priority is the Cousin, which gets the rest, blocked by the Father/Son/Brother
        const sharePerCousin = remainingEstate / roles.cousin.length;
        roles.cousin.forEach((c) => shares.set(c._id, sharePerCousin));
        remainingEstate = 0;
      }
    }

    // Mapping the final shares to the beneficiary objects for the UI
    const finalDistribution = beneficiaries.map((b) => ({
      ...b,
      percentage: ((shares.get(b._id) || 0) * 100).toFixed(2),
      isBlocked: (shares.get(b._id) || 0) === 0,
    }));

    // Sorting the distributions, so the highest is at the top
    finalDistribution.sort(
      (a, b) => Number(b.percentage) - Number(a.percentage),
    );
    setDistribution(finalDistribution);
  };

  // Trigger for the browser to download
  const downloadWillPDF = () => {
    setStatus("Generating Legal PDF Document...");

    const doc = new jsPDF();

    //The title and header
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Last Will and Testament", 105, 20, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text(
      "Islamic Faraid Distribution (Tawzi' Al-Fara'id Al-Islamiyyah)",
      105,
      28,
      { align: "center" },
    );

    //The body text
    doc.setFontSize(10);
    let yPos = 45;

    doc.text(
      "In accordance with Islamic Inheritance Law, my assets shall be distributed",
      20,
      yPos,
    );
    yPos += 7;
    doc.text(
      "to my registered family members in the following exact proportions:",
      20,
      yPos,
    );
    yPos += 15;

    distribution.forEach((d) => {
      doc.setFont("helvetica", "bold");
      doc.text(
        `[${d.percentage}%] - ${d.full_name} (${d.relationship.toUpperCase()})`,
        25,
        yPos,
      );
      yPos += 7;

      if (d.isBlocked) {
        doc.setFont("helvetica", "italic");
        doc.setTextColor(200, 50, 50);
        doc.text(
          `*Note: Under Faraid hierarchy, this beneficiary is currently blocked from inheriting.`,
          30,
          yPos,
        );
        doc.setTextColor(0, 0, 0);
        yPos += 7;
      }
      doc.setFont("helvetica", "normal");
    });

    //Prayer
    yPos += 15;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(11);
    doc.text(
      '"Our Lord! Forgive me, my parents, and the believers on the Day of Judgment."',
      105,
      yPos,
      { align: "center" },
    );

    yPos += 6;
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(
      "Rabbana-ghfir li wa liwalidayya wa lilmu'minina yawma yaqumul-hisab (Quran 14:41)",
      105,
      yPos,
      { align: "center" },
    );

    // Watermark
    yPos += 15;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.text(
      "This document was mathemtically generate by the SureWill Cryptographic Engine.",
      105,
      yPos,
      { align: "center" },
    );

    doc.save("Sharia_Will_PDF");
    setTimeout(
      () =>
        setStatus(
          "PDF Download Success. You may now encrypt and upload this to your vault.",
        ),
      1500,
    );
  };

  if (beneficiaries.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-8 pt-8 border-t border-[#E8E3DC]"
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#FDF6ED]">
          <Scale className="w-5 h-5 text-[#A07030]" />
        </div>
        <div>
          <h2 className="font-serif text-2xl text-[#2D2926]">
            Smart Legal Layer (Faraid)
          </h2>
          <p className="text-sm text-[#8C8579]">
            Dynamically generated distribution based on Islamic inheritance
            laws.
          </p>
        </div>
      </div>

      <div
        className="rounded-3xl p-8 bg-white border border-[#E8E3DC]"
        style={{ boxShadow: "0 10px 40px rgba(0,0,0,0.04)" }}
      >
        <div className="grid md:grid-cols-2 gap-4 mb-8">
          {distribution.map((d) => (
            <div
              key={d._id}
              className={`p-4 rounded-xl border ${d.isBlocked ? "bg-gray-50 border-gray-200 opacity-60" : "bg-[#F0F5F2] border-[#B8D4BF]"}`}
            >
              <div className="flex justify-between items-center mb-1">
                <span className="font-medium text-[#2D2926]">
                  {d.full_name}
                </span>
                <span
                  className={`font-bold ${d.isBlocked ? "text-gray-400" : "text-[#4A7A5A]"}`}
                >
                  {d.percentage}%
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs uppercase tracking-wider text-[#8C8579]">
                  {d.relationship}
                </span>
                {d.isBlocked && (
                  <span className="text-[10px] text-red-400 font-medium">
                    Blocked by Hierarchy
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {status && (
          <div className="mb-4 p-3 rounded-xl text-xs font-medium flex items-center gap-2 bg-[#F0F5F2] text-[#4A7A5A] border border-[#B8D4BF]">
            <CheckCircle className="w-4 h-4 flex-shrink-0" /> {status}
          </div>
        )}

        <button
          onClick={downloadWillPDF}
          className="w-full flex justify-center items-center gap-2 py-3.5 rounded-xl text-white text-sm font-medium transition-all hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #C9A96E, #A07030)" }}
        >
          <FileText className="w-4 h-4" /> Generate Legal Will Document
        </button>
      </div>
    </motion.div>
  );
};
