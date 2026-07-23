"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, setToken } from "../../lib/api";

export default function SignupPage() {
  const router = useRouter();
  const [workspaceName, setWorkspaceName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await apiFetch("/api/auth/signup", {
        method: "POST",
        body: { workspaceName, email, password },
      });
      setToken(data.token);
      router.push("/dashboard/contacts");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 360, margin: "80px auto" }}>
      <h1>Create your workspace</h1>
      <p className="muted" style={{ marginBottom: 24 }}>
        Each workspace is fully isolated — your contacts and campaigns are never visible to another account.
      </p>
      {error && <div className="error-banner" style={{ marginBottom: 16 }}>{error}</div>}
      <form onSubmit={onSubmit} className="stack">
        <div>
          <label>Workspace / company name</label>
          <input required value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} />
        </div>
        <div>
          <label>Email</label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label>Password (min 8 characters)</label>
          <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button type="submit" disabled={loading}>{loading ? "Creating..." : "Create workspace"}</button>
      </form>
      <p className="muted" style={{ marginTop: 16 }}>
        Already have an account? <Link href="/login">Log in</Link>
      </p>
    </div>
  );
}
