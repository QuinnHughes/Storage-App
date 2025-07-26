// src/api/client.js
const API_BASE = import.meta.env.VITE_API_URL || '';

export default async function apiFetch(path, opts = {}) {
  // pull JWT from localStorage
  const token = localStorage.getItem('token');

  // merge headers: (a) default JSON, (b) token if present, (c) any from opts
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(opts.headers || {}),
  };

  // perform the fetch to /api/<path>
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',  // if you ever use cookies/sessions
    ...opts,
    headers,
  });

  return res;
}
