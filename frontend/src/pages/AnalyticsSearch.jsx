import { useState, useEffect } from "react";

export default function AnalyticsSearch() {
  const [titleQ, setTitleQ] = useState("");
  const [barcodeQ, setBarcodeQ] = useState("");
  const [altCallQ, setAltCallQ] = useState("");
  const [callnoQ, setCallnoQ] = useState("");
  const [policyFilter, setPolicyFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");

  const [policies, setPolicies] = useState([]);
  const [locations, setLocations] = useState([]);
  const [statuses, setStatuses] = useState([]);

  useEffect(() => {
    async function fetchFilters() {
      try {
        const token = localStorage.getItem('token');
        const resp = await fetch("/catalog/search/analytics/filters", {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        if (!resp.ok) throw new Error(`Status ${resp.status}`);
        const data = await resp.json();
        setPolicies(data.item_policies || []);
        setLocations(data.location_codes || []);
        setStatuses(data.status || []);
      } catch (err) {
        console.error("Error fetching analytics filters:", err);
      }
    }
    fetchFilters();
  }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    setError("");
    setResults([]);
    setSearched(false);

    let qs = "?";
    if (titleQ.trim()) qs += `title=${encodeURIComponent(titleQ.trim())}&`;
    if (barcodeQ.trim()) qs += `barcode=${encodeURIComponent(barcodeQ.trim())}&`;
    if (altCallQ.trim()) qs += `alternative_call_number=${encodeURIComponent(altCallQ.trim())}&`;
    if (callnoQ.trim()) qs += `call_number=${encodeURIComponent(callnoQ.trim())}&`;
    if (policyFilter) qs += `item_policy=${encodeURIComponent(policyFilter)}&`;
    if (locationFilter) qs += `location_code=${encodeURIComponent(locationFilter)}&`;
    if (statusFilter) qs += `status=${encodeURIComponent(statusFilter)}&`;
    if (qs.endsWith("&")) qs = qs.slice(0, -1);

    try {
      const token = localStorage.getItem('token');
      const resp = await fetch("/catalog/search/analytics" + qs, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (resp.ok) {
        setResults(await resp.json());
      } else {
        const { detail } = await resp.json();
        setError(detail || "No matching analytics records found.");
      }
      setSearched(true);
    } catch {
      setError("Network error. Try again.");
      setSearched(true);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-8">
      <h2 className="text-2xl font-semibold mb-6">Analytics Search</h2>

      <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        {/* Row 1: text inputs */}
        <input
          type="text"
          placeholder="Search by title"
          value={titleQ}
          onChange={(e) => setTitleQ(e.target.value)}
          className="p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400"
        />
        <input
          type="text"
          placeholder="Search by barcode"
          value={barcodeQ}
          onChange={(e) => setBarcodeQ(e.target.value)}
          className="p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400"
        />
        <input
          type="text"
          placeholder="Search by alt call #"
          value={altCallQ}
          onChange={(e) => setAltCallQ(e.target.value)}
          className="p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400"
        />
        <input
          type="text"
          placeholder="Search by call number"
          value={callnoQ}
          onChange={(e) => setCallnoQ(e.target.value)}
          className="p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400"
        />

        {/* Row 2: dropdowns */}
        <select
          className="p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400"
          value={policyFilter}
          onChange={(e) => setPolicyFilter(e.target.value)}
        >
          <option value="">Filter by Item Policy</option>
          {policies.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select
          className="p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400"
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value)}
        >
          <option value="">Filter by Location Code</option>
          {locations.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
        <select
          className="p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">Filter by Status</option>
          {statuses.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <div /> {/* spacer */}

        {/* Row 3: Search button */}
        <button
          type="submit"
          className="col-span-1 md:col-span-4 bg-green-600 text-white font-medium px-6 py-3 rounded-lg hover:bg-green-700 transition"
        >
          Search
        </button>
      </form>

      {error && <p className="text-red-600 mb-4">{error}</p>}

      {searched && !error && results.length === 0 && (
        <p className="mt-4 text-gray-600">No matching analytics records found.</p>
      )}

      {results.length > 0 && (
        <>
          <div className="flex justify-end mb-4">
            <button
              onClick={downloadCSV}
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition"
            >
              Export CSV
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {results.map((a) => (
              <div key={a.id} className="p-4 bg-white rounded-lg shadow hover:shadow-md">
                <h4 className="text-lg font-semibold">{a.title}</h4>
                <p className="text-sm text-gray-500">Barcode: {a.barcode}</p>
                <p className="text-sm">Alt Call #: {a.alternative_call_number}</p>
                <p className="text-sm">Call #: {a.call_number}</p>
                <p className="text-sm">Status: {a.status}</p>
                <p className="text-sm">Policy: {a.item_policy}</p>
                <p className="text-sm">Location: {a.location_code}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
