// src/pages/SudocRecords.jsx
import React, { useState, useEffect } from "react";
import apiFetch from '../api/client';

export default function SudocRecords() {
  const [query, setQuery] = useState("");
  const [titleQuery, setTitleQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [checkedOutIds, setCheckedOutIds] = useState(new Set());
  const [page, setPage] = useState(1);
  const limit = 20; // items per page

  // Hydrate checked-out IDs from localStorage on mount
  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem("checkedOut") || "[]");
    setCheckedOutIds(new Set(saved.map(r => r.id)));
  }, []);

  const fetchResults = async (newPage = 1) => {
    if (!query && !titleQuery) {
      setResults([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("token");
      // build query string manually:
      const qs = new URLSearchParams({
        query,
        title: titleQuery,
        limit: limit.toString(),
        page: newPage.toString(),
      }).toString();

      const res = await apiFetch(`/catalog/sudoc/search/sudoc?${qs}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || `Status ${res.status}`);
      }

      const data = await res.json();
      setResults(data);
      setPage(newPage);
    } catch (e) {
      setError(e.message);
    } finally {
     setLoading(false);
    }
  };
  const handleCheckout = rec => {
    const saved = JSON.parse(localStorage.getItem("checkedOut") || "[]");
    if (!saved.find(r => r.id === rec.id)) {
      const nextSaved = [...saved, rec];
      localStorage.setItem("checkedOut", JSON.stringify(nextSaved));
      setCheckedOutIds(prev => new Set(prev).add(rec.id));
    }
  };

  // Pagination helpers
  const hasPrev = page > 1;
  const hasNext = results.length === limit;
  const delta = 2; // how many pages to show on either side
  const startPage = Math.max(1, page - delta);
  const endPage   = page + delta;

  return (
    <div className="p-6 max-w-100% mx-auto space-y-8">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-2xl font-semibold mb-4">SuDoc Search</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="SuDoc call number..."
            className="border p-2 rounded"
          />
          <input
            value={titleQuery}
            onChange={e => setTitleQuery(e.target.value)}
            placeholder="Title contains..."
            className="border p-2 rounded"
          />
          <button
            onClick={() => fetchResults(1)}
            disabled={loading}
            className={`px-4 py-2 rounded font-medium ${
              loading
                ? "bg-gray-400 text-gray-200 cursor-default"
                : "bg-blue-600 hover:bg-blue-700 text-white"
            }`}
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </div>
        {error && <p className="mt-2 text-red-600">{error}</p>}
      </div>

      {results.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h3 className="text-xl font-semibold">Results (Page {page})</h3>
          <table className="w-full table-auto">
            <thead className="bg-gray-50">
              <tr>
                {["SuDoc", "Title", "OCLC", "Action"].map(h => (
                  <th key={h} className="px-4 py-2 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map(rec => (
                <tr key={rec.id} className="border-b">
                  <td className="px-4 py-2">{rec.sudoc}</td>
                  <td className="px-4 py-2">{rec.title}</td>
                  <td className="px-4 py-2">{rec.oclc || "—"}</td>
                  <td className="px-4 py-2">
                    {checkedOutIds.has(rec.id) ? (
                      <button
                        disabled
                        className="bg-green-500 text-white px-3 py-1 rounded opacity-80 cursor-not-allowed"
                      >
                        ✓
                      </button>
                    ) : (
                      <button
                        onClick={() => handleCheckout(rec)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded"
                      >
                        Checkout
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination controls */}
          <div className="flex items-center justify-center space-x-2 mt-4">
            <button
              onClick={() => fetchResults(page - 1)}
              disabled={!hasPrev || loading}
              className={`px-4 py-2 rounded ${
                hasPrev
                  ? "bg-gray-200 hover:bg-gray-300"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
            >
              ‹ Prev
            </button>

            {Array.from({ length: endPage - startPage + 1 }, (_, idx) => {
              const p = startPage + idx;
              return (
                <button
                  key={p}
                  onClick={() => fetchResults(p)}
                  disabled={p === page || loading}
                  className={`px-3 py-1 rounded ${
                    p === page
                      ? "bg-blue-600 text-white cursor-default"
                      : "bg-gray-200 hover:bg-gray-300 text-gray-700"
                  }`}
                >
                  {p}
                </button>
              );
            })}

            <button
              onClick={() => fetchResults(page + 1)}
              disabled={!hasNext || loading}
              className={`px-4 py-2 rounded ${
                hasNext
                  ? "bg-gray-200 hover:bg-gray-300"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
            >
              Next ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
