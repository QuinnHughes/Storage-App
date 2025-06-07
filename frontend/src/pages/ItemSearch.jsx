// src/pages/ItemSearch.jsx

import { useState, useEffect } from "react";

export default function ItemSearch() {
  const [query, setQuery] = useState("");
  const [floorFilter, setFloorFilter] = useState("");
  const [rangeFilter, setRangeFilter] = useState("");
  const [ladderFilter, setLadderFilter] = useState("");
  const [shelfFilter, setShelfFilter] = useState("");
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);

  const [floors, setFloors] = useState([]);
  const [ranges, setRanges] = useState([]);
  const [ladders, setLadders] = useState([]);
  const [shelves, setShelves] = useState([]);

  // Fetch distinct dropdown values on mount
  useEffect(() => {
    async function fetchFilters() {
      try {
        const resp = await fetch("/catalog/search/item-filters");
        if (!resp.ok) throw new Error(`Status ${resp.status}`);
        const data = await resp.json();
        setFloors(data.floors || []);
        setRanges(data.ranges || []);
        setLadders(data.ladders || []);
        setShelves(data.shelves || []);
      } catch (error) {
        console.error("Error fetching filter values:", error);
      }
    }
    fetchFilters();
  }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (
      !query.trim() &&
      !floorFilter &&
      !rangeFilter &&
      !ladderFilter &&
      !shelfFilter
    ) {
      return;
    }

    try {
      let qs = "?";
      if (query) {
        qs += `barcode=${encodeURIComponent(query)}&`;
        qs += `alternative_call_number=${encodeURIComponent(query)}&`;
      }
      if (floorFilter) qs += `floor=${encodeURIComponent(floorFilter)}&`;
      if (rangeFilter) qs += `range_code=${encodeURIComponent(rangeFilter)}&`;
      if (ladderFilter) qs += `ladder=${encodeURIComponent(ladderFilter)}&`;
      if (shelfFilter) qs += `shelf=${encodeURIComponent(shelfFilter)}&`;
      if (qs.endsWith("&")) qs = qs.slice(0, -1);

      const resp = await fetch("/catalog/search/items" + qs);
      if (!resp.ok) {
        setResults([]);
        setSearched(true);
        return;
      }
      const data = await resp.json();
      setResults(data);
      setSearched(true);
    } catch (error) {
      console.error("Search error:", error);
      setResults([]);
      setSearched(true);
    }
  };

  // Build and download a CSV of Title | Barcode | Location | Status
  const exportCSV = () => {
    if (results.length === 0) return;
    const header = ["Title", "Barcode", "Location", "Status"];
    const rows = results.map(item => [
      item.analytics?.title || "",
      item.barcode,
      item.alternative_call_number,
      item.analytics?.status || "",
    ]);
    const csvContent = [header, ...rows]
      .map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `item-search-${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-6xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">Item Search</h1>

      <form
        onSubmit={handleSearch}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
      >
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by barcode or alt call #"
          className="col-span-1 sm:col-span-2 lg:col-span-4 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
        />

        <select
          className="p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
          value={floorFilter}
          onChange={(e) => setFloorFilter(e.target.value)}
        >
          <option value="">Filter by Floor</option>
          {floors.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>

        <select
          className="p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
          value={rangeFilter}
          onChange={(e) => setRangeFilter(e.target.value)}
        >
          <option value="">Filter by Range</option>
          {ranges.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>

        <select
          className="p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
          value={ladderFilter}
          onChange={(e) => setLadderFilter(e.target.value)}
        >
          <option value="">Filter by Ladder</option>
          {ladders.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>

        <select
          className="p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
          value={shelfFilter}
          onChange={(e) => setShelfFilter(e.target.value)}
        >
          <option value="">Filter by Shelf</option>
          {shelves.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <button
          type="submit"
          className="col-span-1 sm:col-span-2 lg:col-span-4 bg-blue-600 text-white font-medium px-6 py-3 rounded-lg hover:bg-blue-700 transition"
        >
          Search
        </button>
      </form>

      {!searched && (
        <p className="text-gray-600 text-center">
          Enter a barcode or alternative call number, or use the filters above.
        </p>
      )}

      {searched && results.length === 0 && (
        <p className="mt-4 text-red-600 text-center">
          No matching items found.
        </p>
      )}

      {results.length > 0 && (
        <>
          <div className="flex justify-end mb-4">
            <button
              onClick={exportCSV}
              className="bg-green-600 text-white font-medium px-4 py-2 rounded hover:bg-green-700 transition"
            >
              Export CSV
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-6">
            {results.map((item) => (
              <div
                key={item.barcode + item.alternative_call_number}
                className="p-4 bg-white rounded-lg shadow hover:shadow-md"
              >
                <h4 className="text-lg font-semibold">
                  {item.analytics?.title || "No title"}
                </h4>
                <p className="text-sm text-gray-500">
                  Barcode: {item.barcode}
                </p>
                <p className="text-sm">
                  Location: {item.alternative_call_number}
                </p>
                <p className="text-sm">
                  Status: {item.analytics?.status || "-"}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
