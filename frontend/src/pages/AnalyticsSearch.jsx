import { useState, useEffect } from "react";
import apiFetch from '../api/client';
import RecordViewerModal from '../components/RecordViewerModal';

// -----------------------------------------------------------------------------
// Helper to export any array of objects to CSV and trigger a download
// -----------------------------------------------------------------------------
function downloadCSV(data, filename = "analytics.csv") {
  if (!Array.isArray(data) || data.length === 0) return;

  // Build header row
  const header = Object.keys(data[0]).join(",");
  // Build data rows
  const rows = data
    .map((obj) =>
      Object.values(obj)
        .map((val) =>
          // Escape any quotes in the value
          typeof val === "string"
            ? `"${val.replace(/"/g, '""')}"`
            : val
        )
        .join(",")
    )
    .join("\n");

  const csvContent = `${header}\n${rows}`;
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

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

  // Record viewer modal state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState(null);
  const [userRole, setUserRole] = useState('viewer');

  useEffect(() => {
    // Get user role from API
    async function fetchUserRole() {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          setUserRole('viewer');
          return;
        }
        const resp = await apiFetch('/auth/me', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (resp.ok) {
          const userData = await resp.json();
          setUserRole(userData.role || 'viewer');
        }
      } catch (err) {
        console.error('Failed to fetch user role:', err);
        setUserRole('viewer');
      }
    }

    fetchUserRole();

    async function fetchFilters() {
      try {
        const token = localStorage.getItem("token");
        const resp = await apiFetch("/analytics/search/analytics/filters", {
          headers: { Authorization: `Bearer ${token}` },
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
    if (altCallQ.trim())
      qs += `alternative_call_number=${encodeURIComponent(altCallQ.trim())}&`;
    if (callnoQ.trim())
      qs += `call_number=${encodeURIComponent(callnoQ.trim())}&`;
    if (policyFilter) qs += `item_policy=${encodeURIComponent(policyFilter)}&`;
    if (locationFilter)
      qs += `location_code=${encodeURIComponent(locationFilter)}&`;
    if (statusFilter) qs += `status=${encodeURIComponent(statusFilter)}&`;
    if (qs.endsWith("&")) qs = qs.slice(0, -1);

    try {
      const token = localStorage.getItem("token");
      const resp = await apiFetch("/analytics/search/analytics" + qs, {
        headers: { Authorization: `Bearer ${token}` },
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

  const handleViewRecord = (recordId) => {
    setSelectedRecordId(recordId);
    setViewerOpen(true);
  };

  const handleDelete = (deletedId) => {
    // Remove deleted record from results
    setResults(results.filter(r => r.id !== deletedId));
  };

  const handleEdit = (updatedRecord) => {
    // Update the record in results
    setResults(results.map(r => r.id === updatedRecord.id ? { ...r, ...updatedRecord } : r));
  };

  return (
    <div className="max-w-100% mx-auto p-8">
      <h2 className="text-2xl font-semibold mb-6">Analytics Search</h2>

      <form
        onSubmit={handleSearch}
        className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8"
      >
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
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          className="p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400"
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value)}
        >
          <option value="">Filter by Location Code</option>
          {locations.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <select
          className="p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">Filter by Status</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
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
        <p className="mt-4 text-gray-600">
          No matching analytics records found.
        </p>
      )}

      {results.length > 0 && (
        <>
          <div className="flex justify-end mb-4">
            <button
              onClick={() => downloadCSV(results, "analytics.csv")}
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition"
            >
              Export CSV
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {results.map((a) => (
              <div
                key={a.id}
                className="p-4 bg-white rounded-lg shadow hover:shadow-md relative"
              >
                {/* Accession Status Badge */}
                <div className="absolute top-2 right-2">
                  {a.has_item_link ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800" title="Item has been accessioned">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      Accessioned
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600" title="Not yet accessioned">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      Pending
                    </span>
                  )}
                </div>
                
                <h4 className="text-lg font-semibold pr-24">{a.title}</h4>
                <p className="text-sm text-gray-500">
                  Barcode: {a.barcode}
                </p>
                <p className="text-sm">
                  Alt Call #: {a.alternative_call_number}
                </p>
                <p className="text-sm">Call #: {a.call_number}</p>
                <p className="text-sm">
                  Status: <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    a.has_item_link ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}>{a.status}</span>
                </p>
                <p className="text-sm">Policy: {a.item_policy}</p>
                <p className="text-sm">
                  Location: {a.location_code}
                </p>
                <button
                  onClick={() => handleViewRecord(a.id)}
                  className="mt-3 w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  View Record
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Record Viewer Modal */}
      <RecordViewerModal
        isOpen={viewerOpen}
        onClose={() => setViewerOpen(false)}
        recordType="analytics"
        recordId={selectedRecordId}
        userRole={userRole}
        onDelete={handleDelete}
        onEdit={handleEdit}
      />
    </div>
  );
}
