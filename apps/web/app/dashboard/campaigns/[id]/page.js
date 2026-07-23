"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "../../../../lib/api";

export default function CampaignDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [campaign, setCampaign] = useState(null);
  const [recipients, setRecipients] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const data = await apiFetch(`/api/campaigns/${id}`);
    setCampaign(data.campaign);
    setRecipients(data.recipients);
  }, [id]);

  const loadAnalytics = useCallback(async () => {
    try {
      const data = await apiFetch(`/api/campaigns/${id}/analytics`);
      setAnalytics(data);
    } catch {
      // ignore transient poll errors
    }
  }, [id]);

  // Initial load
  useEffect(() => {
    load();
    loadAnalytics();
  }, [load, loadAnalytics]);

  // Poll BOTH campaign details and analytics every 4 seconds
  useEffect(() => {
    const poll = async () => {
      try {
        await Promise.all([
          load(),
          loadAnalytics(),
        ]);
      } catch {
        // Ignore temporary polling errors
      }
    };

    const timer = setInterval(poll, 4000);

    return () => clearInterval(timer);
  }, [load, loadAnalytics]);

  async function cancelSend() {
    try {
      await apiFetch(`/api/campaigns/${id}/cancel`, { method: "POST" });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function duplicate() {
    try {
      const data = await apiFetch(`/api/campaigns/${id}/duplicate`, {
        method: "POST",
      });
      router.push(`/dashboard/campaigns/${data.campaign.id}`);
    } catch (err) {
      setError(err.message);
    }
  }

  if (!campaign) return <p className="muted">Loading...</p>;

  return (
    <div>
      <div className="row between">
        <h1>{campaign.name}</h1>

        <div className="row">
          {campaign.status === "scheduled" && (
            <button className="secondary" onClick={cancelSend}>
              Cancel send
            </button>
          )}

          <button className="secondary" onClick={duplicate}>
            Duplicate
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div className="card row">
        <div>
          <span className="pill">{campaign.status}</span>
        </div>

        <div className="muted">
          Subject: {campaign.subject}
        </div>

        {campaign.scheduled_at && (
          <div className="muted">
            Scheduled for{" "}
            {new Date(campaign.scheduled_at).toLocaleString()}
          </div>
        )}
      </div>

      {analytics && (
        <div className="card">
          <h3>
            Performance{" "}
            <span
              className="muted"
              style={{ fontSize: 12, fontWeight: 400 }}
            >
              (refreshes automatically)
            </span>
          </h3>

          <div className="row">
            <div className="stat" style={{ flex: 1 }}>
              <div className="value">{analytics.total}</div>
              <div className="label">Recipients</div>
            </div>

            <div className="stat" style={{ flex: 1 }}>
              <div className="value">{analytics.sent}</div>
              <div className="label">Sent</div>
            </div>

            <div className="stat" style={{ flex: 1 }}>
              <div className="value">{analytics.delivered}</div>
              <div className="label">Delivered</div>
            </div>

            <div className="stat" style={{ flex: 1 }}>
              <div className="value">{analytics.opened}</div>
              <div className="label">Opened</div>
            </div>
          </div>

          <p className="muted">
            Open tracking relies on a pixel some mail clients block, so opens
            are a lower bound, not exact.
          </p>
        </div>
      )}

      <div className="card">
        <h3>Recipients</h3>

        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Status</th>
            </tr>
          </thead>

          <tbody>
            {recipients.map((r) => (
              <tr key={r.id}>
                <td>{r.name || "—"}</td>
                <td>{r.email || "—"}</td>
                <td>
                  {r.matched ? (
                    <span className="pill">{r.status}</span>
                  ) : (
                    <span className="pill warn">unmatched</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}