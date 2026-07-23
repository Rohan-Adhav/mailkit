"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";

export default function AudiencesPage() {
  const [audiences, setAudiences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [mode, setMode] = useState("tag"); // "tag" | "field"
  const [tag, setTag] = useState("");
  const [field, setField] = useState("city");
  const [value, setValue] = useState("");
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const data = await apiFetch("/api/audiences");
    setAudiences(data.audiences);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function currentFilter() {
    return mode === "tag" ? { tag } : { field, value };
  }

  useEffect(() => {
    const filter = currentFilter();
    const hasEnough = mode === "tag" ? !!tag : !!value;
    if (!hasEnough) { setPreview(null); return; }
    const t = setTimeout(async () => {
      try {
        const data = await apiFetch("/api/audiences/preview", { method: "POST", body: { filter } });
        setPreview(data.memberCount);
      } catch { setPreview(null); }
    }, 300);
    return () => clearTimeout(t);
  }, [mode, tag, field, value]);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      await apiFetch("/api/audiences", { method: "POST", body: { name, filter: currentFilter() } });
      setName(""); setTag(""); setValue("");
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(id) {
    if (!confirm("Delete this audience?")) return;
    await apiFetch(`/api/audiences/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <h1>Audiences</h1>
      <p className="muted" style={{ marginBottom: 16 }}>
        Save a filter over your contacts once, then pick it when sending a campaign.
      </p>

      {error && <div className="error-banner" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="card">
        <h3>New audience</h3>
        <form onSubmit={onSubmit} className="stack">
          <div>
            <label>Name</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Mumbai VIPs" />
          </div>
          <div className="row">
            <div>
              <label>Filter by</label>
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="tag">Tag</option>
                <option value="field">Custom field</option>
              </select>
            </div>
            {mode === "tag" ? (
              <div style={{ flex: 1 }}>
                <label>Tag</label>
                <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="vip" />
              </div>
            ) : (
              <>
                <div style={{ flex: 1 }}>
                  <label>Field name</label>
                  <input value={field} onChange={(e) => setField(e.target.value)} placeholder="city" />
                </div>
                <div style={{ flex: 1 }}>
                  <label>Value</label>
                  <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Mumbai" />
                </div>
              </>
            )}
          </div>
          {preview !== null && <p className="muted">Matches {preview} contact{preview === 1 ? "" : "s"} right now.</p>}
          <div><button type="submit">Save audience</button></div>
        </form>
      </div>

      <div className="card">
        {loading ? (
          <p className="muted">Loading...</p>
        ) : audiences.length === 0 ? (
          <p className="muted">No audiences yet.</p>
        ) : (
          <table>
            <thead><tr><th>Name</th><th>Filter</th><th>Members</th><th></th></tr></thead>
            <tbody>
              {audiences.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td className="muted">{a.filter.tag ? `tag = ${a.filter.tag}` : `${a.filter.field} = ${a.filter.value}`}</td>
                  <td>{a.memberCount}</td>
                  <td><button className="danger" onClick={() => remove(a.id)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
