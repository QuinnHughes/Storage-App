// src/pages/AnalyticsErrors.jsx

import React, { useEffect, useState } from "react";

export default function AnalyticsErrors() {
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    fetch("/catalog/analytics-errors")
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
      <h1 className="text-3xl font-bold mb-6">Analytics Errors</h1>

      {errors.length === 0 ? (
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
              {errors.map((err) => (
                <tr key={err.id} className="even:bg-gray-50">
                  <td className="border px-3 py-2">{err.id}</td>
                  <td className="border px-3 py-2">{err.barcode}</td>
                  <td className="border px-3 py-2">
                    {err.alternative_call_number}
                  </td>
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
