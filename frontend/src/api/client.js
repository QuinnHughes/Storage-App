// src/api/client.js
const API_BASE = import.meta.env.VITE_API_URL || "";

export default function apiFetch(path, options = {}) {
  // auto-prepend /api, spread in any headers/options
  return fetch(`${API_BASE}${path}`, {
    credentials: "include",       // if you need cookies/session
    ...options,
  });
}
