import React, { useEffect, useState, useMemo } from "react";
import apiFetch from '../api/client';

export default function AnalyticsErrors() {
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [statusFilter, setStatusFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");

  useEffect(() => {
    const token = localStorage.getItem("token");
    apiFetch("/catalog/analytics-errors/", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setErrors(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load analytics errors:", err);
        setErrorMsg("Could not load analytics errors.");
        setLoading(false);
      });
  }, []);

  const errorTypes = useMemo(() => {
    return Array.from(new Set(errors.map((err) => err.error_reason)));
  }, [errors]);

  const filteredErrors = useMemo(() => {
    let result = errors;
    if (statusFilter !== "All") {
      result = result.filter((err) => err.status.toLowerCase() === statusFilter.toLowerCase());
    }
    if (typeFilter !== "All") {
      result = result.filter((err) => err.error_reason === typeFilter);
    }
    return result;
  }, [errors, statusFilter, typeFilter]);

  const handleExportCsv = () => {
    if (!filteredErrors.length) return;
    const headers = [
      'ID',
      'Barcode',
      'Alt Call #',
      'Title',
      'Call No.',
      'Status',
      'Error Reason'
    ];
    const rows = filteredErrors.map(err => [
      err.id,
      err.barcode,
      err.alternative_call_number,
      err.title,
      err.call_number,
      err.status,
      err.error_reason
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row
        .map(cell => `"${String(cell).replace(/"/g, '""')}"`)
        .join(',')
      )
      .join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'analytics_errors.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return <div className="p-8">Loading analytics errors…</div>;
  }

  if (errorMsg) {
    return (
      <div className="p-8 text-red-600">
        <strong>Error:</strong> {errorMsg}
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-4">Analytics Errors</h1>

      <div className="flex gap-4 mb-6">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border rounded px-3 py-2"
        >
          <option>All</option>
          <option>Active</option>
          <option>Deleted</option>
        </select>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="border rounded px-3 py-2"
        >
          <option>All</option>
          {errorTypes.map((type) => (
            <option key={type}>{type}</option>
          ))}
        </select>

        <button
          onClick={handleExportCsv}
          className="ml-auto bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700"
        >
          Export CSV
        </button>
      </div>

      {filteredErrors.length === 0 ? (
        <div>No analytics errors found.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full table-auto border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="border px-3 py-2 text-left">ID</th>
                <th className="border px-3 py-2 text-left">Barcode</th>
                <th className="border px-3 py-2 text-left">Alt Call #</th>
                <th className="border px-3 py-2 text-left">Title</th>
                <th className="border px-3 py-2 text-left">Call No.</th>
                <th className="border px-3 py-2 text-left">Status</th>
                <th className="border px-3 py-2 text-left">Error Reason</th>
              </tr>
            </thead>
            <tbody>
              {filteredErrors.map((err) => (
                <tr key={err.id} className="even:bg-gray-50">
                  <td className="border px-3 py-2">{err.id}</td>
                  <td className="border px-3 py-2">{err.barcode}</td>
                  <td className="border px-3 py-2">{err.alternative_call_number}</td>
                  <td className="border px-3 py-2">{err.title}</td>
                  <td className="border px-3 py-2">{err.call_number}</td>
                  <td className="border px-3 py-2">{err.status}</td>
                  <td className="border px-3 py-2">{err.error_reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
