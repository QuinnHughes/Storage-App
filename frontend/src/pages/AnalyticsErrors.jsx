import React, { useEffect, useState, useMemo } from "react";
import apiFetch from '../api/client';

export default function AnalyticsErrors() {
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [statusFilter, setStatusFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [selectedError, setSelectedError] = useState(null);
  const [locationItems, setLocationItems] = useState([]);
  const [loadingLocationItems, setLoadingLocationItems] = useState(false);

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

  const fetchLocationItems = async (error) => {
    setLoadingLocationItems(true);
    try {
      const token = localStorage.getItem("token");
      let queryParams = new URLSearchParams();
      
      if (error.alternative_call_number) {
        queryParams.append('location', error.alternative_call_number);
      }
      
      const response = await apiFetch(`/catalog/analytics-errors/location-items?${queryParams}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const items = await response.json();
        setLocationItems(items);
      } else {
        setLocationItems([]);
      }
    } catch (err) {
      console.error("Failed to fetch location items:", err);
      setLocationItems([]);
    } finally {
      setLoadingLocationItems(false);
    }
  };

  const handleViewLocation = (error) => {
    setSelectedError(error);
    fetchLocationItems(error);
  };

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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Analytics Errors</h1>
          <p className="text-gray-600 mt-1">
            Analytics records that don't match known items in inventory
          </p>
        </div>
        <div className="text-sm text-gray-500">
          {filteredErrors.length} error{filteredErrors.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option>All</option>
              <option>Active</option>
              <option>Deleted</option>
            </select>
          </div>

          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-700 mb-1">Error Type</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option>All</option>
              {errorTypes.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </div>

          <div className="ml-auto">
            <button
              onClick={handleExportCsv}
              className="bg-blue-600 text-white rounded-md px-4 py-2 hover:bg-blue-700 transition-colors duration-200 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export CSV
            </button>
          </div>
        </div>
      </div>

      {filteredErrors.length === 0 ? (
        <div className="text-center py-12">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No analytics errors found</h3>
          <p className="mt-1 text-sm text-gray-500">All analytics records are properly matched with inventory items.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredErrors.map((err) => (
            <div key={err.id} className="bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow duration-200">
              <div className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        ID #{err.id}
                      </span>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        err.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {err.status}
                      </span>
                    </div>

                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      {err.title || 'Untitled Item'}
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="font-medium text-gray-700">Barcode:</span>
                        <span className="ml-2 font-mono text-gray-900">{err.barcode}</span>
                      </div>
                      <div>
                        <span className="font-medium text-gray-700">Call Number:</span>
                        <span className="ml-2 font-mono text-gray-900">{err.call_number || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="font-medium text-gray-700">Alt Call #:</span>
                        <span className="ml-2 font-mono text-gray-900">{err.alternative_call_number || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="font-medium text-gray-700">Error Reason:</span>
                        <span className="ml-2 text-red-600">{err.error_reason}</span>
                      </div>
                    </div>
                  </div>

                  <div className="ml-4 flex flex-col gap-2">
                    {err.alternative_call_number && (
                      <button
                        onClick={() => handleViewLocation(err)}
                        className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors duration-200 flex items-center gap-2 text-sm"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        View Location
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Location Items Modal */}
      {selectedError && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Items in Location: {selectedError.alternative_call_number}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Items actually found in this location in our inventory
                  </p>
                </div>
                <button
                  onClick={() => setSelectedError(null)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {loadingLocationItems ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
                  <p className="text-gray-600 mt-2">Loading items...</p>
                </div>
              ) : locationItems.length === 0 ? (
                <div className="text-center py-8">
                  <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2 2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                  <h4 className="mt-2 text-sm font-medium text-gray-900">No items found</h4>
                  <p className="mt-1 text-sm text-gray-500">
                    No items are currently stored in this location according to our inventory.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {locationItems.map((item) => (
                    <div key={item.id} className="bg-gray-50 rounded-md p-4 border border-gray-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-gray-900">
                            Barcode: <span className="font-mono">{item.barcode}</span>
                          </div>
                          <div className="text-sm text-gray-600">
                            Call Number: <span className="font-mono">{item.alternative_call_number}</span>
                          </div>
                          {item.location && (
                            <div className="text-sm text-gray-600">
                              Location: {item.location} | Floor: {item.floor} | Range: {item.range_code}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="mt-4 text-sm text-gray-500 text-center">
                    Showing {locationItems.length} item{locationItems.length !== 1 ? 's' : ''} in this location
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
