// src/pages/AnalyticsSearch.jsx
import { useState } from "react";

export default function AnalyticsSearch() {
  const [titleQ, setTitleQ] = useState("");
  const [callnoQ, setCallnoQ] = useState("");
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");

  const handleSearch = async (e) => {
    e.preventDefault();
    setResults(null);
    setError("");

    if (!titleQ.trim() && !callnoQ.trim()) {
      setError("Enter a title or call number (or both).");
      return;
    }

    const params = new URLSearchParams();
    if (titleQ.trim()) params.append("title", titleQ.trim());
    if (callnoQ.trim()) params.append("call_number", callnoQ.trim());

    try {
      const resp = await fetch(`/catalog/search/analytics?${params.toString()}`);
      if (resp.ok) {
        const data = await resp.json();
        setResults(data);
      } else {
        const err = await resp.json();
        setError(err.detail || "No matching analytics records found.");
      }
    } catch (e) {
      console.error(e);
      setError("Network error. Try again.");
    }
  };

  return (
    <div className="p-4 max-w-xl mx-auto">
      <h2 className="text-2xl font-semibold mb-4">Analytics Search</h2>
      <form onSubmit={handleSearch} className="space-y-3">
        <div className="flex">
          <input
            type="text"
            placeholder="Search by title"
            value={titleQ}
            onChange={(e) => setTitleQ(e.target.value)}
            className="flex-1 border rounded px-3 py-2"
          />
        </div>
        <div className="flex">
          <input
            type="text"
            placeholder="Search by call number"
            value={callnoQ}
            onChange={(e) => setCallnoQ(e.target.value)}
            className="flex-1 border rounded px-3 py-2"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2 bg-green-600 text-white rounded"
        >
          Search
        </button>
      </form>

      {error && <p className="text-red-600 mt-2">{error}</p>}

      {results && (
        <table className="w-full border-collapse mt-4">
          <thead>
            <tr className="bg-gray-200">
              <th className="border px-2 py-1">ID</th>
              <th className="border px-2 py-1">Barcode</th>
              <th className="border px-2 py-1">Alt Call #</th>
              <th className="border px-2 py-1">Title</th>
              <th className="border px-2 py-1">Call #</th>
              <th className="border px-2 py-1">Status</th>
            </tr>
          </thead>
          <tbody>
            {results.map((a) => (
              <tr key={a.id} className="even:bg-gray-50">
                <td className="border px-2 py-1">{a.id}</td>
                <td className="border px-2 py-1">{a.barcode}</td>
                <td className="border px-2 py-1">
                  {a.alternative_call_number}
                </td>
                <td className="border px-2 py-1">{a.title}</td>
                <td className="border px-2 py-1">{a.call_number}</td>
                <td className="border px-2 py-1">{a.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
