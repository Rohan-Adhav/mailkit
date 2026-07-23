"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "../../../lib/api";

const statusColors = {
  draft: "", scheduled: "warn", sending: "warn", sent: "", failed: "warn",
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const data = await apiFetch("/api/campaigns");
    setCampaigns(data.campaigns);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  return (
    <div>
      <div className="row between">
        <h1>Campaigns</h1>
        <Link href="/dashboard/campaigns/new"><button>New campaign</button></Link>
      </div>

      <div className="card">
        {loading ? (
          <p className="muted">Loading...</p>
        ) : campaigns.length === 0 ? (
          <p className="muted">No campaigns yet.</p>
        ) : (
          <table>
            <thead><tr><th>Name</th><th>Status</th><th>Recipients</th><th>Scheduled</th><th></th></tr></thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td><span className={`pill ${statusColors[c.status]}`}>{c.status}</span></td>
                  <td>{c.recipient_count}</td>
                  <td className="muted">{c.scheduled_at ? new Date(c.scheduled_at).toLocaleString() : "—"}</td>
                  <td><Link href={`/dashboard/campaigns/${c.id}`}>View</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
