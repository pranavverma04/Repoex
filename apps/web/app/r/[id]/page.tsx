"use client";
import { motion } from "motion/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { RepoReport } from "@ara/shared";
import { Report } from "@/components/explain/Report";
import { api } from "@/lib/api";

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<RepoReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .report(Number(id))
      .then((r) => {
        setReport(r);
        document.title = `${r.repo.fullName} explained · AI-Repo-Assistant`;
      })
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) {
    return (
      <div className="page center-msg">
        <h1>Report not found</h1>
        <p className="muted">{error}</p>
        <Link href="/" className="button">
          Explain a repo
        </Link>
      </div>
    );
  }
  if (!report) {
    return (
      <div className="report loading" aria-busy="true" aria-label="Loading report">
        <div className="rp-head">
          <motion.div className="sk-row" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <span className="sk sk-avatar lg" />
            <span className="sk-lines">
              <span className="sk sk-l1" />
              <span className="sk sk-l2" />
            </span>
          </motion.div>
          <span className="sk" style={{ width: "70%", height: 34, marginTop: 24 }} />
        </div>
      </div>
    );
  }
  return <Report report={report} />;
}
