// src/pages/SudocRecords.jsx
import React, { useState } from "react";
import axios from "axios";
import SudocEditor from "./SudocEditor";

export default function SudocRecords() {
  const [query, setQuery]         = useState("");
  const [titleQuery, setTitleQuery] = useState("");
  const [results, setResults]     = useState([]);
  const [page, setPage]           = useState(1);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [checkedOut, setCheckedOut] = useState(() => {
    try { return JSON.parse(localStorage.getItem("checkedOut")) || []; }
    catch { return []; }
  });
  const [showEditor, setShowEditor] = useState(false);

  const fetchResults = async (p = 1) => {
    if (!query) { setResults([]); return; }
    setLoading(true); setError("");
    const token = localStorage.getItem("token");
    try {
      const { data } = await axios.get("/catalog/sudoc/search/sudoc", {
        params: { query, title: titleQuery, limit: 20, page: p },
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setResults(data);
      setPage(p);
    } catch (e) {
      setError(e.response?.data?.detail || "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch    = () => fetchResults(1);
  const handlePageClick = (p) => fetchResults(p);

  const checkout = (rec) => {
    const arr = [...checkedOut.filter((r) => r.id !== rec.id), rec];
    setCheckedOut(arr);
    localStorage.setItem("checkedOut", JSON.stringify(arr));
    setShowEditor(true);
  };

  return (
    <div className="p-6 max-w-full mx-auto space-y-8">
      {/* Search */}
      <div className="rounded-lg p-6 bg-white shadow">
        <h2 className="text-2xl font-semibold mb-4">SuDoc Search</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="SuDoc…"
            className="border p-2 rounded"
          />
          <input
            value={titleQuery}
            onChange={(e) => setTitleQuery(e.target.value)}
            placeholder="Title…"
            className="border p-2 rounded"
          />
          <button
            onClick={handleSearch}
            disabled={loading}
            className={`px-4 py-2 rounded font-medium ${
              loading ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700 text-white"
            }`}
          >
            {loading ? "…" : "Search"}
          </button>
        </div>
        {error && <p className="mt-2 text-red-600">{error}</p>}
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-xl font-semibold mb-4">Results</h3>
          <table className="w-full table-auto">
            <thead className="bg-gray-50">
              <tr>
                {["SuDoc","Title","OCLC","Action"].map((h) => (
                  <th key={h} className="px-4 py-2 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map((rec) => (
                <tr key={rec.id} className="border-b">
                  <td className="px-4 py-2">{rec.sudoc}</td>
                  <td className="px-4 py-2">{rec.title}</td>
                  <td className="px-4 py-2">{rec.oclc || "—"}</td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => checkout(rec)}
                      className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded"
                    >
                      Check Out
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          <div className="mt-4 flex justify-center space-x-2">
            {[1,2,3,4,5].map((p) => (
              <button
                key={p}
                onClick={() => handlePageClick(p)}
                className={`px-3 py-1 rounded ${
                  p === page ? "bg-blue-600 text-white" : "bg-gray-200"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Inline Editor */}
      {showEditor && (
        <div className="bg-gray-50 border p-6 rounded-lg">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-semibold">Editor</h3>
            <button
              onClick={() => setShowEditor(false)}
              className="text-sm text-gray-600 hover:underline"
            >
              Close
            </button>
          </div>
          <SudocEditor records={checkedOut} />
        </div>
      )}
    </div>
  );
}
