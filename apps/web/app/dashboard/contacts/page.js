"use client";
import { useEffect, useState, useRef } from "react";
import { apiFetch } from "../../../lib/api";

const emptyForm = { name: "", email: "", phone: "", city: "", tags: "" };

export default function ContactsPage() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [importMsg, setImportMsg] = useState(null);
  const fileRef = useRef(null);

  async function load() {
    setLoading(true);
    const data = await apiFetch("/api/contacts");
    setContacts(data.contacts);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function fieldsFromForm(f) {
    const custom_fields = {};
    if (f.city) custom_fields.city = f.city;
    if (f.tags) custom_fields.tags = f.tags.split(",").map((t) => t.trim()).filter(Boolean);
    return { name: f.name || null, email: f.email || null, phone: f.phone || null, custom_fields };
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      const payload = fieldsFromForm(form);
      if (editingId) {
        await apiFetch(`/api/contacts/${editingId}`, { method: "PUT", body: payload });
      } else {
        await apiFetch("/api/contacts", { method: "POST", body: payload });
      }
      setForm(emptyForm);
      setEditingId(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEdit(c) {
    setEditingId(c.id);
    setForm({
      name: c.name || "",
      email: c.email || "",
      phone: c.phone || "",
      city: c.custom_fields?.city || "",
      tags: (c.custom_fields?.tags || []).join(", "),
    });
  }

  async function remove(id) {
    if (!confirm("Delete this contact?")) return;
    await apiFetch(`/api/contacts/${id}`, { method: "DELETE" });
    load();
  }

  async function onImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportMsg(null);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const data = await apiFetch("/api/contacts/import", { method: "POST", body: fd });
      setImportMsg(data.message);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div>
      <div className="row between">
        <h1>Contacts</h1>
        <div>
          <input ref={fileRef} type="file" accept=".csv" onChange={onImport} style={{ display: "none" }} id="csv-input" />
          <label htmlFor="csv-input">
            <span className="row" style={{ cursor: "pointer" }}>
              <button type="button" className="secondary" onClick={() => fileRef.current?.click()}>
                Import CSV
              </button>
            </span>
          </label>
        </div>
      </div>

      {importMsg && <div className="card" style={{ background: "var(--accent-soft)", borderColor: "var(--accent)" }}>{importMsg}</div>}
      {error && <div className="error-banner" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="card">
        <h3>{editingId ? "Edit contact" : "Add a contact"}</h3>
        <form onSubmit={onSubmit} className="stack">
          <div className="row">
            <div style={{ flex: 1 }}>
              <label>Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div style={{ flex: 1 }}>
              <label>Email</label>
              <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div style={{ flex: 1 }}>
              <label>Phone</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div className="row">
            <div style={{ flex: 1 }}>
              <label>City (custom field)</label>
              <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div style={{ flex: 1 }}>
              <label>Tags (comma separated, custom field)</label>
              <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="vip, newsletter" />
            </div>
          </div>
          <div className="row">
            <button type="submit">{editingId ? "Save changes" : "Add contact"}</button>
            {editingId && (
              <button type="button" className="secondary" onClick={() => { setEditingId(null); setForm(emptyForm); }}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="card">
        {loading ? (
          <p className="muted">Loading...</p>
        ) : contacts.length === 0 ? (
          <p className="muted">No contacts yet. Add one above or import a CSV.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Name</th><th>Email</th><th>Phone</th><th>City</th><th>Tags</th><th></th></tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id}>
                  <td>{c.name || "—"}</td>
                  <td>{c.email || "—"}</td>
                  <td>{c.phone || "—"}</td>
                  <td>{c.custom_fields?.city || "—"}</td>
                  <td>{(c.custom_fields?.tags || []).join(", ") || "—"}</td>
                  <td className="row">
                    <button className="secondary" onClick={() => startEdit(c)}>Edit</button>
                    <button className="danger" onClick={() => remove(c.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
