const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("mailkit_token");
}

export function setToken(token) {
  localStorage.setItem("mailkit_token", token);
}

export function clearToken() {
  localStorage.removeItem("mailkit_token");
}

export function isLoggedIn() {
  return !!getToken();
}

/**
 * Thin fetch wrapper: prefixes the API origin, attaches the bearer token,
 * JSON-encodes bodies (unless it's already FormData, for the CSV upload),
 * and throws on non-2xx so callers can catch() a single error path.
 */
export async function apiFetch(path, options = {}) {
  const token = getToken();
  const isFormData = options.body instanceof FormData;

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    body: options.body && !isFormData ? JSON.stringify(options.body) : options.body,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}
