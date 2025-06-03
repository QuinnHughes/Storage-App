// src/pages/ItemSearch.jsx
import { useState } from "react";

export default function ItemSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");

  const handleSearch = async (e) => {
    e.preventDefault();
    setResults(null);
    setError("");

    if (!query.trim()) {
      setError("Enter a barcode or alternative call number.");
      return;
    }

    try {
      const resp = await fetch(
        `/catalog/search/items?q=${encodeURIComponent(query.trim())}`
      );
      if (resp.ok) {
        const data = await resp.json();
        setResults(data);
      } else {
        const err = await resp.json();
        setError(err.detail || "No matching items found.");
      }
    } catch (e) {
      console.error(e);
      setError("Network error. Try again.");
    }
  };

  return (
    <div className="p-4 max-w-xl mx-auto">
      <h2 className="text-2xl font-semibold mb-4">Item Search</h2>
      <form onSubmit={handleSearch} className="flex mb-4">
        <input
          type="text"
          placeholder="Barcode or alternative call #"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 border rounded px-3 py-2"
        />
        <button
          type="submit"
          className="ml-2 px-4 py-2 bg-blue-600 text-white rounded"
        >
          Search
        </button>
      </form>

      {error && <p className="text-red-600">{error}</p>}

      {results && (
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-200">
              <th className="border px-2 py-1">ID</th>
              <th className="border px-2 py-1">Barcode</th>
              <th className="border px-2 py-1">Alt Call #</th>
              <th className="border px-2 py-1">Location</th>
              <th className="border px-2 py-1">Floor</th>
              <th className="border px-2 py-1">Range</th>
              <th className="border px-2 py-1">Ladder</th>
              <th className="border px-2 py-1">Shelf</th>
              <th className="border px-2 py-1">Pos</th>
            </tr>
          </thead>
          <tbody>
            {results.map((item) => (
              <tr key={item.id} className="even:bg-gray-50">
                <td className="border px-2 py-1">{item.id}</td>
                <td className="border px-2 py-1">{item.barcode}</td>
                <td className="border px-2 py-1">
                  {item.alternative_call_number}
                </td>
                <td className="border px-2 py-1">{item.location}</td>
                <td className="border px-2 py-1">{item.floor}</td>
                <td className="border px-2 py-1">{item.range_code}</td>
                <td className="border px-2 py-1">{item.ladder}</td>
                <td className="border px-2 py-1">{item.shelf}</td>
                <td className="border px-2 py-1">{item.position}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
