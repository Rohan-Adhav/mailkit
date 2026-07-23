"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, setToken } from "../../lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await apiFetch("/api/auth/login", { method: "POST", body: { email, password } });
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
      <h1>MailKit</h1>
      <p className="muted" style={{ marginBottom: 24 }}>Log in to your workspace.</p>
      {error && <div className="error-banner" style={{ marginBottom: 16 }}>{error}</div>}
      <form onSubmit={onSubmit} className="stack">
        <div>
          <label>Email</label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label>Password</label>
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button type="submit" disabled={loading}>{loading ? "Logging in..." : "Log in"}</button>
      </form>
      <p className="muted" style={{ marginTop: 16 }}>
        No account yet? <Link href="/signup">Sign up</Link>
      </p>
    </div>
  );
}
