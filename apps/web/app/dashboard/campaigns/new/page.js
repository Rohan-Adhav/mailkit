"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../../../lib/api";

export default function NewCampaignPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const [recipientMode, setRecipientMode] = useState("audience"); // "audience" | "manual"
  const [audiences, setAudiences] = useState([]);
  const [audienceId, setAudienceId] = useState("");
  const [tag, setTag] = useState("");
  const [useTagInstead, setUseTagInstead] = useState(false);
  const [pasted, setPasted] = useState("");
  const [preview, setPreview] = useState(null);

  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    apiFetch("/api/audiences").then((d) => setAudiences(d.audiences));
  }, []);

  async function runPreview() {
    setError("");
    try {
      const body =
        recipientMode === "audience"
          ? useTagInstead
            ? { mode: "audience", tag }
            : { mode: "audience", audienceId }
          : { mode: "manual", manualList: pasted.split("\n") };
      const data = await apiFetch("/api/campaigns/preview-recipients", { method: "POST", body });
      setPreview(data);
    } catch (err) {
      setError(err.message);
      setPreview(null);
    }
  }

  async function createCampaign(afterCreate) {
    setError("");
    setCreating(true);
    try {
      const payload = {
        name, subject, body,
        recipientMode,
        ...(recipientMode === "audience"
          ? useTagInstead ? { tag } : { audienceId }
          : { manualList: pasted.split("\n") }),
      };
      const data = await apiFetch("/api/campaigns", { method: "POST", body: payload });
      await afterCreate(data.campaign.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function saveDraft() {
    await createCampaign((id) => router.push(`/dashboard/campaigns/${id}`));
  }

  async function sendNow() {
    await createCampaign(async (id) => {
      await apiFetch(`/api/campaigns/${id}/send-now`, { method: "POST" });
      router.push(`/dashboard/campaigns/${id}`);
    });
  }

  const [scheduleAt, setScheduleAt] = useState("");
  async function scheduleSend() {
    if (!scheduleAt) { setError("Pick a date and time first"); return; }
    await createCampaign(async (id) => {
      await apiFetch(`/api/campaigns/${id}/schedule`, {
        method: "POST",
        body: { sendAt: new Date(scheduleAt).toISOString() },
      });
      router.push(`/dashboard/campaigns/${id}`);
    });
  }

  return (
    <div>
      <h1>New campaign</h1>
      {error && <div className="error-banner" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="card stack">
        <h3>Content</h3>
        <div>
          <label>Campaign name (internal)</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="July newsletter" />
        </div>
        <div>
          <label>Subject line</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Your July update" />
        </div>
        <div>
          <label>Body (HTML allowed)</label>
          <textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} placeholder="<p>Hi there...</p>" />
        </div>
      </div>

      <div className="card stack">
        <h3>Recipients</h3>
        <div className="row">
          <label style={{ display: "flex", alignItems: "center", gap: 6, width: "auto" }}>
            <input type="radio" style={{ width: "auto" }} checked={recipientMode === "audience"} onChange={() => setRecipientMode("audience")} />
            Audience or tag
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, width: "auto" }}>
            <input type="radio" style={{ width: "auto" }} checked={recipientMode === "manual"} onChange={() => setRecipientMode("manual")} />
            Paste a list
          </label>
        </div>

        {recipientMode === "audience" ? (
          <div className="stack">
            <div className="row">
              <label style={{ display: "flex", alignItems: "center", gap: 6, width: "auto" }}>
                <input type="checkbox" style={{ width: "auto" }} checked={useTagInstead} onChange={(e) => setUseTagInstead(e.target.checked)} />
                Use a raw tag instead of a saved audience
              </label>
            </div>
            {useTagInstead ? (
              <div>
                <label>Tag</label>
                <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="vip" />
              </div>
            ) : (
              <div>
                <label>Saved audience</label>
                <select value={audienceId} onChange={(e) => setAudienceId(e.target.value)}>
                  <option value="">Select an audience...</option>
                  {audiences.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} ({a.memberCount})</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        ) : (
          <div>
            <label>Paste emails or phone numbers, one per line</label>
            <textarea rows={6} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={"aarav@example.com\n+919876543210\nunknown@example.com"} />
          </div>
        )}

        <div><button type="button" className="secondary" onClick={runPreview}>Preview recipients</button></div>

        {preview && (
          <div>
            <p className="muted">{preview.matchedCount} matched, {preview.unmatchedCount} unmatched</p>
            <table>
              <thead><tr><th>Name</th><th>Email</th><th>Status</th></tr></thead>
              <tbody>
                {preview.recipients.map((r, i) => (
                  <tr key={i}>
                    <td>{r.name || "—"}</td>
                    <td>{r.email || r.raw}</td>
                    <td>{r.matched ? <span className="pill">matched</span> : <span className="pill warn">unmatched</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card stack">
        <h3>Send</h3>
        <div className="row">
          <button type="button" onClick={sendNow} disabled={creating}>Send now</button>
        </div>
        <div className="row">
          <input type="datetime-local" style={{ width: 220 }} value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
          <button type="button" className="secondary" onClick={scheduleSend} disabled={creating}>Schedule</button>
        </div>
        <div className="row">
          <button type="button" className="secondary" onClick={saveDraft} disabled={creating}>Save as draft</button>
        </div>
      </div>
    </div>
  );
}
